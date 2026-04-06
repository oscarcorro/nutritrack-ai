// Edge function: ai-generate-meal-plan
// Input: { plan_date: "YYYY-MM-DD" }
// Generates a personalized daily meal plan and inserts it into meal_plans + meal_plan_items.

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON, WEB_SEARCH_TOOL } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface RequestBody {
  plan_date: string
  daily_activities?: string
  preferences?: string
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

const MODEL = "claude-sonnet-4-6"

const SYSTEM = `Eres un nutricionista deportivo basado en evidencia cientifica. Tus planes deben ser efectivos, sostenibles y respaldados por la literatura (Helms, Aragon, Schoenfeld, Trexler, ISSN position stands).

PRINCIPIOS CIENTIFICOS QUE DEBES RESPETAR SIEMPRE:
1. PROTEINA ES PRIORITARIA. Distribuye 3-5 tomas de >=0.4 g/kg cada una (umbral de leucina ~2.5-3 g por comida) para maximizar sintesis proteica muscular. No agrupes toda la proteina en una sola comida.
2. DEFICIT/SUPERAVIT SOSTENIBLE. En deficit (lose_weight) prioriza saciedad: alta proteina, alta fibra, alimentos de alto volumen y baja densidad calorica (verduras, legumbres, fruta entera, carnes magras, lacteos 0%). En superavit (gain_muscle) prioriza densidad calorica y facilidad de ingesta (carbos complejos, grasas saludables, lacteos enteros).
3. INTENSIDAD. El campo "Intensidad" del usuario indica que tan agresivo es el deficit/superavit:
   - light = conservador, maxima retencion muscular / minima ganancia de grasa
   - moderate = estandar
   - aggressive = rapido, solo para bloques cortos; aun asi, mantener proteina alta
4. CARBOS ALREDEDOR DEL ENTRENO. Si el usuario indica que va a entrenar, coloca la mayor ingesta de carbohidratos en la comida previa (1-3 h antes) y la posterior (ventana de 0-2 h despues). En dias sedentarios puedes bajar carbos y subir grasas manteniendo proteina.
5. FIBRA 25-40 g/dia. De fuentes reales: verduras, legumbres, fruta entera, avena, integrales. Es clave para saciedad y salud intestinal.
6. GRASAS SANAS >=0.8 g/kg. Aceite de oliva virgen extra, frutos secos, aguacate, pescado azul, huevo entero. Evita grasas trans y exceso de ultraprocesados.
7. MICRONUTRIENTES. Incluye al menos 2 raciones de verdura/fruta por dia, pescado azul 2-3 veces/semana, legumbres 2-4 veces/semana, lacteos o alternativa enriquecida con calcio, y variedad de colores.
8. EFECTO TERMOGENICO Y SACIEDAD. En deficit, prioriza proteina magra, sopas/cremas, ensaladas voluminosas, fruta entera sobre zumos, integrales sobre refinados. Esto es mas importante que "ser estricto" con macros exactos.
9. HIDRATACION Y TIMING. Recuerda recetas faciles por la manana si el usuario madruga, y cenas ligeras y tempranas para mejor descanso.
10. VARIEDAD Y SOSTENIBILIDAD. No repitas la misma proteina 5 veces al dia. Rota fuentes (pollo, pavo, pescado blanco, pescado azul, huevo, legumbres, yogur griego, queso fresco, tofu/tempeh).
11. CUMPLIR MACROS. El total del plan debe cuadrar con calorias +-5% y proteina +-10%. Carbs y grasas pueden variar +-15%.

Debes crear un plan para UN dia completo respetando:
- Las calorias y macros objetivo del usuario (reparto adecuado entre comidas)
- Las preferencias, alergias e intolerancias del usuario
- Sus cocinas preferidas
- No repetir platos de los planes recientes
- Usar ingredientes comunes y faciles de encontrar en Espana
- Recetas realistas, practicas y sabrosas (max 30 min de prep para el dia a dia)
- Proporcionar el numero de comidas indicado
- Si hay despensa del usuario, prioriza esos ingredientes (especialmente con marcas concretas). Puedes usar web_search para buscar macros reales de productos de marca si los usas.

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
    const { plan_date, daily_activities, preferences } = (await req.json()) as RequestBody
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

    // Load food already logged for this date, so the plan accounts for
    // meals the user already ate. Only the remaining meal slots get
    // AI-generated, using the remaining macro budget.
    const { data: loggedToday } = await client
      .from("food_log")
      .select("meal_type, meal_name, calories, protein_g, carbs_g, fat_g, fiber_g")
      .eq("user_id", user.id)
      .gte("logged_at", `${plan_date}T00:00:00`)
      .lte("logged_at", `${plan_date}T23:59:59`)

    const logged = (loggedToday ?? []) as Array<{
      meal_type: string | null
      meal_name: string
      calories: number | null
      protein_g: number | null
      carbs_g: number | null
      fat_g: number | null
      fiber_g: number | null
    }>

    const consumed = logged.reduce(
      (acc, l) => ({
        calories: acc.calories + (l.calories || 0),
        protein: acc.protein + (l.protein_g || 0),
        carbs: acc.carbs + (l.carbs_g || 0),
        fat: acc.fat + (l.fat_g || 0),
        fiber: acc.fiber + (l.fiber_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    )
    const goal = ctx.goal as Record<string, number>
    const remaining = {
      calories: Math.max(0, (goal.daily_calories_target || 0) - consumed.calories),
      protein: Math.max(0, (goal.protein_g || 0) - consumed.protein),
      carbs: Math.max(0, (goal.carbs_g || 0) - consumed.carbs),
      fat: Math.max(0, (goal.fat_g || 0) - consumed.fat),
      fiber: Math.max(0, (goal.fiber_g || 0) - consumed.fiber),
    }
    const loggedTypes = new Set(logged.map((l) => l.meal_type).filter(Boolean) as string[])
    const loggedText = logged.length
      ? `\n\nCOMIDAS YA REGISTRADAS HOY (NO las repitas, NO generes nada para estos meal_type):
${logged
  .map(
    (l) =>
      `- ${l.meal_type ?? "?"}: ${l.meal_name} — ${l.calories ?? 0} kcal, P ${l.protein_g ?? 0}g, C ${l.carbs_g ?? 0}g, G ${l.fat_g ?? 0}g`
  )
  .join("\n")}

CONSUMIDO: ${consumed.calories} kcal, P ${consumed.protein}g, C ${consumed.carbs}g, G ${consumed.fat}g
MACROS RESTANTES DEL DIA: ${remaining.calories} kcal, P ${remaining.protein}g, C ${remaining.carbs}g, G ${remaining.fat}g, F ${remaining.fiber}g

IMPORTANTE: Genera SOLO las comidas restantes (meal_type NO incluidos arriba). El total de lo que generes debe cuadrar con los MACROS RESTANTES, no con el total del dia.`
      : ""

    const mealSchedule = (ctx.profile as { meal_schedule?: Record<string, string> } | null)?.meal_schedule
    const scheduleText = mealSchedule && Object.keys(mealSchedule).length
      ? `\n\nHORARIOS DE COMIDAS DEL USUARIO:\n${Object.entries(mealSchedule).map(([k, v]) => `- ${k}: ${v}`).join("\n")}\n(Ajusta cada comida al horario — p.ej. comida previa al entrenamiento debe tener carbos)`
      : ""
    const activitiesText = daily_activities
      ? `\n\nACTIVIDADES DEL DIA (el usuario ha descrito lo que hara hoy):\n"${daily_activities}"\n(Adapta el plan: antes de entrenos fuertes incluye carbos, post-entreno proteina, dias sedentarios baja calorias, etc.)`
      : ""
    const prefsText = preferences
      ? `\n\nPREFERENCIAS ESPECIFICAS PARA HOY:\n"${preferences}"`
      : ""

    const text = await callAnthropic({
      model: MODEL,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `${contextPrompt}${scheduleText}${activitiesText}${prefsText}${loggedText}\n\nGenera el plan de comidas para el dia ${plan_date}. ${logged.length ? "Respeta los MACROS RESTANTES indicados arriba." : "Respeta el total de calorias y macros diarios."}`,
        },
      ],
      max_tokens: 8192,
      temperature: 0.8,
      tools: [WEB_SEARCH_TOOL],
    })

    const parsed = extractJSON<GeneratedPlan>(text)
    if (!parsed?.meals?.length) throw new Error("Plan invalido generado por IA")

    // Belt-and-braces: drop any meal the AI produced for an already-logged slot.
    parsed.meals = parsed.meals.filter((m) => !loggedTypes.has(m.meal_type))
    if (!parsed.meals.length) throw new Error("Ya tienes comidas registradas para todo el dia")

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
