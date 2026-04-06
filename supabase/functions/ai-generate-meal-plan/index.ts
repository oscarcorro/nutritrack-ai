// Edge function: ai-generate-meal-plan
// Input: { plan_date: "YYYY-MM-DD" }
// Generates a personalized daily meal plan and inserts it into meal_plans + meal_plan_items.

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface RequestBody {
  plan_date: string
}

interface GeneratedMeal {
  meal_type: "breakfast" | "morning_snack" | "lunch" | "afternoon_snack" | "dinner"
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

interface GeneratedPlan {
  meals: GeneratedMeal[]
}

const MODEL = "claude-sonnet-4-5"

const SYSTEM = `Eres un nutricionista experto que crea planes de comida personalizados, variados y deliciosos.

Debes crear un plan para UN dia completo respetando:
- Las calorias y macros objetivo (distribuidos adecuadamente entre comidas)
- Las preferencias, alergias e intolerancias del usuario
- Sus cocinas preferidas
- No repetir platos de los planes recientes
- Usar ingredientes comunes y faciles de encontrar en Espana
- Recetas realistas, practicas y sabrosas
- Proporcionar el numero de comidas indicado

Devuelve SOLO JSON valido con esta estructura:
{
  "meals": [
    {
      "meal_type": "breakfast|morning_snack|lunch|afternoon_snack|dinner",
      "meal_name": "nombre del plato",
      "description": "como prepararlo, 1-2 frases",
      "ingredients": [{"name": "ingrediente", "quantity_g": 100}],
      "calories": 400,
      "protein_g": 25,
      "carbs_g": 45,
      "fat_g": 12,
      "fiber_g": 6,
      "prep_time_min": 15
    }
  ]
}
Todos los numericos como numeros. Responde SOLO con JSON.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const client = getUserClient(req)
    const user = await getUser(client)
    const { plan_date } = (await req.json()) as RequestBody
    if (!plan_date) {
      return new Response(JSON.stringify({ error: "plan_date required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const ctx = await loadUserContext(client, user.id)
    if (!ctx.goal) {
      return new Response(
        JSON.stringify({ error: "Completa tu perfil y objetivos antes de generar un plan" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    const contextPrompt = buildUserContextPrompt(ctx)

    const text = await callAnthropic({
      model: MODEL,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${contextPrompt}\n\nGenera el plan de comidas para el dia ${plan_date}. Respeta el total de calorias y macros diarios.`,
        },
      ],
      max_tokens: 4096,
      temperature: 0.8,
    })

    const parsed = extractJSON<GeneratedPlan>(text)
    if (!parsed?.meals?.length) throw new Error("Plan invalido generado por IA")

    // Compute totals
    const totals = parsed.meals.reduce(
      (acc, m) => ({
        calories: acc.calories + (m.calories || 0),
        protein: acc.protein + (m.protein_g || 0),
        carbs: acc.carbs + (m.carbs_g || 0),
        fat: acc.fat + (m.fat_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )

    // Delete any existing plan for that date (regenerate case)
    const { data: existing } = await client
      .from("meal_plans")
      .select("id")
      .eq("user_id", user.id)
      .eq("plan_date", plan_date)
      .maybeSingle()
    if (existing) {
      await client.from("meal_plans").delete().eq("id", (existing as { id: string }).id)
    }

    const { data: planRow, error: planErr } = await client
      .from("meal_plans")
      .insert({
        user_id: user.id,
        plan_date,
        total_calories: totals.calories,
        total_protein_g: totals.protein,
        total_carbs_g: totals.carbs,
        total_fat_g: totals.fat,
        status: "active",
        ai_model: MODEL,
      })
      .select()
      .single()
    if (planErr || !planRow) throw planErr ?? new Error("Failed to insert plan")

    const planId = (planRow as { id: string }).id
    const itemsToInsert = parsed.meals.map((m, idx) => ({
      meal_plan_id: planId,
      meal_type: m.meal_type,
      sort_order: idx,
      meal_name: m.meal_name,
      description: m.description,
      ingredients: m.ingredients,
      calories: m.calories,
      protein_g: m.protein_g,
      carbs_g: m.carbs_g,
      fat_g: m.fat_g,
      fiber_g: m.fiber_g,
      prep_time_min: m.prep_time_min,
      is_swapped: false,
      original_item_id: null,
    }))

    const { error: itemsErr } = await client.from("meal_plan_items").insert(itemsToInsert)
    if (itemsErr) throw itemsErr

    return new Response(JSON.stringify({ plan_id: planId, meals: parsed.meals.length, totals }), {
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
