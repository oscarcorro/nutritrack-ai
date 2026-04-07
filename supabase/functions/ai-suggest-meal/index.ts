// Edge function: ai-suggest-meal
// Input: { plan_date, meal_type, notes? }
// Suggests a single meal for the given slot, respecting what's already
// logged/planned for that day and the remaining macro budget, then inserts
// it into meal_plan_items (creating the meal_plan row if needed).

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

type MealType = "breakfast" | "morning_snack" | "lunch" | "afternoon_snack" | "dinner"

interface RequestBody {
  plan_date: string
  meal_type: MealType
  notes?: string
}

interface SuggestedMeal {
  meal_name: string
  description: string
  ingredients: { name: string; quantity_g: number }[]
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  prep_time_min: number
}

const MODEL = "claude-sonnet-4-5"

const SYSTEM = `Eres un nutricionista. Sugiere UNA sola comida especifica para un slot (desayuno/comida/cena/snack).
Debe encajar en los macros restantes del dia y respetar preferencias, alergias, intolerancias y despensa del usuario.
Si hay productos con marca en la despensa con macros exactos, usalos preferentemente. Si el usuario menciona una marca que no esta en la despensa puedes usar web_search.

Devuelve SOLO JSON con esta estructura:
{
  "meal_name": "nombre",
  "description": "como prepararlo, 1-2 frases",
  "ingredients": [{"name": "ingrediente", "quantity_g": 100}],
  "calories": 500,
  "protein_g": 30,
  "carbs_g": 50,
  "fat_g": 15,
  "fiber_g": 6,
  "prep_time_min": 15
}
Responde SOLO con JSON.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const client = getUserClient(req)
    const user = await getUser(client)
    const { plan_date, meal_type, notes } = (await req.json()) as RequestBody
    if (!plan_date || !meal_type) {
      return new Response(JSON.stringify({ error: "plan_date and meal_type required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const ctx = await loadUserContext(client, user.id)
    if (!ctx.goal) {
      return new Response(JSON.stringify({ error: "Completa tu perfil y objetivos primero" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Fetch existing plan items + today's food log to compute remaining budget
    const { data: existingPlan } = await client
      .from("meal_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("plan_date", plan_date)
      .maybeSingle()

    let planId = (existingPlan as { id: string } | null)?.id ?? null
    let planItems: Array<Record<string, unknown>> = []
    if (planId) {
      const { data } = await client
        .from("meal_plan_items")
        .select("meal_type, meal_name, calories, protein_g, carbs_g, fat_g, fiber_g")
        .eq("meal_plan_id", planId)
      planItems = (data ?? []) as Array<Record<string, unknown>>
      if (planItems.some((i) => i.meal_type === meal_type)) {
        return new Response(
          JSON.stringify({ error: `Ya hay una comida planificada para ${meal_type}. Usa cambiar en lugar de sugerir.` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }
    }

    const { data: loggedToday } = await client
      .from("food_log")
      .select("meal_type, meal_name, calories, protein_g, carbs_g, fat_g, fiber_g")
      .eq("user_id", user.id)
      .gte("logged_at", `${plan_date}T00:00:00`)
      .lte("logged_at", `${plan_date}T23:59:59`)
    const logged = (loggedToday ?? []) as Array<Record<string, unknown>>

    const allConsumedOrPlanned = [...logged, ...planItems]
    const used = allConsumedOrPlanned.reduce(
      (acc, l) => ({
        calories: acc.calories + ((l.calories as number) || 0),
        protein: acc.protein + ((l.protein_g as number) || 0),
        carbs: acc.carbs + ((l.carbs_g as number) || 0),
        fat: acc.fat + ((l.fat_g as number) || 0),
        fiber: acc.fiber + ((l.fiber_g as number) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    )
    const goal = ctx.goal as Record<string, number>
    const remaining = {
      calories: Math.max(0, (goal.daily_calories_target || 0) - used.calories),
      protein: Math.max(0, (goal.protein_g || 0) - used.protein),
      carbs: Math.max(0, (goal.carbs_g || 0) - used.carbs),
      fat: Math.max(0, (goal.fat_g || 0) - used.fat),
      fiber: Math.max(0, (goal.fiber_g || 0) - used.fiber),
    }

    // Heuristic split of the remaining budget for this single slot.
    // Lunch/dinner take bigger share than snacks.
    const share: Record<MealType, number> = {
      breakfast: 0.35,
      morning_snack: 0.5,
      lunch: 0.55,
      afternoon_snack: 0.5,
      dinner: 0.8, // if dinner is the last slot left, give it most of what's left
    }
    // If there are multiple slots left, be more conservative
    const allSlots: MealType[] = ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner"]
    const usedSlots = new Set<string>([
      ...logged.map((l) => l.meal_type as string).filter(Boolean),
      ...planItems.map((l) => l.meal_type as string).filter(Boolean),
      meal_type,
    ])
    const remainingSlotCount = allSlots.filter((s) => !usedSlots.has(s)).length + 1
    const factor = remainingSlotCount > 1 ? 1 / remainingSlotCount : share[meal_type]
    const target = {
      calories: Math.round(remaining.calories * factor),
      protein: Math.round(remaining.protein * factor),
      carbs: Math.round(remaining.carbs * factor),
      fat: Math.round(remaining.fat * factor),
      fiber: Math.round(remaining.fiber * factor),
    }

    const contextPrompt = buildUserContextPrompt(ctx)
    const notesText = notes ? `\n\nPETICION ESPECIFICA DEL USUARIO: "${notes}"` : ""
    const consumedText = allConsumedOrPlanned.length
      ? `\n\nYA CONSUMIDO/PLANIFICADO HOY:\n${allConsumedOrPlanned
          .map(
            (l) =>
              `- ${l.meal_type ?? "?"}: ${l.meal_name} — ${(l.calories as number) || 0} kcal`
          )
          .join("\n")}`
      : ""

    const text = await callAnthropic({
      model: MODEL,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${contextPrompt}${consumedText}${notesText}

SUGIERE UNA comida para el slot "${meal_type}" del dia ${plan_date}.
Macros objetivo aproximados para esta comida: ~${target.calories} kcal, P ${target.protein}g, C ${target.carbs}g, G ${target.fat}g.
Puede variar un 10-15% si eso hace la comida mas realista.`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.9,
    })

    const parsed = extractJSON<SuggestedMeal>(text)
    if (!parsed?.meal_name) throw new Error("Sugerencia invalida")

    // Create plan if needed
    if (!planId) {
      const { data: planRow, error: planErr } = await client
        .from("meal_plans")
        .insert({
          user_id: user.id,
          plan_date,
          status: "active",
          ai_model: MODEL,
        })
        .select()
        .single()
      if (planErr || !planRow) throw planErr ?? new Error("No se pudo crear el plan")
      planId = (planRow as { id: string }).id
    }

    // Compute sort_order from meal_type position
    const order = allSlots.indexOf(meal_type)

    const { data: inserted, error: insErr } = await client
      .from("meal_plan_items")
      .insert({
        meal_plan_id: planId,
        meal_type,
        sort_order: order,
        meal_name: parsed.meal_name,
        description: parsed.description,
        ingredients: parsed.ingredients,
        calories: parsed.calories,
        protein_g: parsed.protein_g,
        carbs_g: parsed.carbs_g,
        fat_g: parsed.fat_g,
        fiber_g: parsed.fiber_g,
        prep_time_min: parsed.prep_time_min,
        is_swapped: false,
        original_item_id: null,
      })
      .select()
      .single()
    if (insErr) throw insErr

    return new Response(JSON.stringify({ plan_id: planId, item: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }
})
