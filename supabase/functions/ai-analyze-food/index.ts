// Edge function: ai-analyze-food
// Receives one of: { text } | { image_base64, media_type } | { transcript }
// Returns: { meal_name, description, items, calories, protein_g, carbs_g, fat_g, fiber_g, confidence, model }

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON, AnthropicContentBlock, WEB_SEARCH_TOOL } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface RequestBody {
  text?: string
  transcript?: string
  image_base64?: string
  media_type?: string
}

const SYSTEM = `Eres un nutricionista experto. Analiza lo que ha comido el usuario y devuelve SOLO JSON valido.

PRIORIDAD MAXIMA — DESPENSA DEL USUARIO:
Antes de estimar nada, revisa la seccion "DESPENSA / NEVERA DEL USUARIO". Si alguno de los alimentos que el usuario dice haber comido coincide (por nombre o marca) con un item de la despensa que tenga "MACROS EXACTOS por 100g/ml", USA ESOS VALORES EXACTOS escalados por la cantidad consumida. No estimes, no busques en web: multiplica. Ej: si la despensa dice "Yogur Pastoret · MACROS EXACTOS por 100g: 95 kcal, P 4g, C 4g, G 7g, F 0g" y el usuario dice "150g de yogur Pastoret", calorias = 95*1.5 = 142.5. Esto es lo mas preciso posible y debes preferirlo siempre.

Solo si NO hay match en la despensa:
- Si el usuario menciona una marca concreta, usa web_search para valores oficiales.
- Para alimentos genericos, estima con conocimiento nutricional estandar.

Estructura:
{
  "meal_name": "nombre corto del plato",
  "description": "descripcion breve",
  "items": [{"name": "ingrediente", "quantity_g": 150}],
  "calories": 450,
  "protein_g": 30,
  "carbs_g": 40,
  "fat_g": 15,
  "fiber_g": 5,
  "confidence": 0.85
}
Calorias y macros en numeros (no strings). Confidence entre 0 y 1. Considera el perfil del usuario para mejor estimacion. Responde SOLO con el JSON, sin texto adicional.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const client = getUserClient(req)
    const user = await getUser(client)
    const ctx = await loadUserContext(client, user.id)
    const userContextPrompt = buildUserContextPrompt(ctx)

    const body = (await req.json()) as RequestBody
    const hasImage = !!body.image_base64
    const userText = body.text ?? body.transcript ?? ""

    if (!hasImage && !userText.trim()) {
      return new Response(JSON.stringify({ error: "No input provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const model = hasImage ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001"

    const content: AnthropicContentBlock[] = []
    if (hasImage) {
      content.push({
        type: "image",
        source: {
          type: "base64",
          media_type: body.media_type || "image/jpeg",
          data: body.image_base64!.replace(/^data:image\/\w+;base64,/, ""),
        },
      })
    }
    content.push({
      type: "text",
      text: `${userContextPrompt}\n\nENTRADA DEL USUARIO:\n${
        hasImage ? "Foto del plato adjunta." : userText
      }\n\nAnaliza el plato y devuelve el JSON.`,
    })

    const text = await callAnthropic({
      model,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      max_tokens: 2048,
      temperature: 0.3,
      tools: [WEB_SEARCH_TOOL],
    })

    const parsed = extractJSON<Record<string, unknown>>(text)
    parsed.model = model

    return new Response(JSON.stringify(parsed), {
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
