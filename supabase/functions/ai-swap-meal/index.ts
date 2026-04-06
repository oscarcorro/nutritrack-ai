// Edge function: ai-swap-meal
// Input: { item_id }
// Replaces a single meal with an alternative of similar macros.

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface RequestBody {
  item_id: string
}

interface SwappedMeal {
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

const MODEL = "claude-haiku-4-5"

const SYSTEM = `Eres un nutricionista. Reemplaza una comida por otra diferente pero con macros similares (dentro de +-10%).
Respeta las preferencias y alergias del usuario. Devuelve SOLO JSON con esta estructura:
{
  "meal_name": "nuevo plato",
  "description": "como prepararlo",
  "ingredients": [{"name": "ingrediente", "quantity_g": 100}],
  "calories": 400,
  "protein_g": 25,
  "carbs_g": 45,
  "fat_g": 12,
  "fiber_g": 5,
  "prep_time_min": 15
}
Responde SOLO con JSON.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const client = getUserClient(req)
    const user = await getUser(client)
    const { item_id } = (await req.json()) as RequestBody
    if (!item_id) {
      return new Response(JSON.stringify({ error: "item_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { data: item, error: itemErr } = await client
      .from("meal_plan_items")
      .select("*")
      .eq("id", item_id)
      .single()
    if (itemErr || !item) throw itemErr ?? new Error("Item not found")

    const original = item as Record<string, unknown>
    const ctx = await loadUserContext(client, user.id)
    const contextPrompt = buildUserContextPrompt(ctx)

    const text = await callAnthropic({
      model: MODEL,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${contextPrompt}\n\nCOMIDA ACTUAL A REEMPLAZAR (${original.meal_type}):
- Nombre: ${original.meal_name}
- Calorias: ${original.calories}
- Proteina: ${original.protein_g} g
- Carbos: ${original.carbs_g} g
- Grasa: ${original.fat_g} g

Genera una alternativa diferente con macros similares.`,
        },
      ],
      max_tokens: 1024,
      temperature: 0.9,
    })

    const parsed = extractJSON<SwappedMeal>(text)

    const { data: updated, error: updErr } = await client
      .from("meal_plan_items")
      .update({
        meal_name: parsed.meal_name,
        description: parsed.description,
        ingredients: parsed.ingredients,
        calories: parsed.calories,
        protein_g: parsed.protein_g,
        carbs_g: parsed.carbs_g,
        fat_g: parsed.fat_g,
        fiber_g: parsed.fiber_g,
        prep_time_min: parsed.prep_time_min,
        is_swapped: true,
        original_item_id: original.original_item_id ?? original.id,
      })
      .eq("id", item_id)
      .select()
      .single()
    if (updErr) throw updErr

    return new Response(JSON.stringify(updated), {
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
