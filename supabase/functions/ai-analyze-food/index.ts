// Edge function: ai-analyze-food
// Receives one of: { text } | { image_base64, media_type } | { transcript }
// Returns: { meal_name, description, items, calories, protein_g, carbs_g, fat_g, fiber_g, confidence, model }

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON, AnthropicContentBlock } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface PantryItemInput {
  name: string
  calories_per_100g?: number
  protein_g?: number
  carbs_g?: number
  fat_g?: number
  fiber_g?: number
}

interface RequestBody {
  text?: string
  transcript?: string
  image_base64?: string
  media_type?: string
  pantry_items?: PantryItemInput[]
}

const SYSTEM = `Eres un nutricionista experto. Analiza lo que ha comido el usuario y devuelve SOLO JSON valido.

PRIORIDAD MAXIMA — DESPENSA DEL USUARIO:
Antes de estimar nada, revisa la seccion "DESPENSA / NEVERA DEL USUARIO". Si alguno de los alimentos que el usuario dice haber comido coincide (por nombre o marca) con un item de la despensa que tenga "MACROS EXACTOS por 100g/ml", USA ESOS VALORES EXACTOS escalados por la cantidad consumida. No estimes, no busques en web: multiplica. Ej: si la despensa dice "Yogur Pastoret · MACROS EXACTOS por 100g: 95 kcal, P 4g, C 4g, G 7g, F 0g" y el usuario dice "150g de yogur Pastoret", calorias = 95*1.5 = 142.5. Esto es lo mas preciso posible y debes preferirlo siempre.

Solo si NO hay match en la despensa:
- Para marcas conocidas, usa tu conocimiento de las etiquetas tipicas.
- Para alimentos genericos, estima con conocimiento nutricional estandar.

Si el alimento coincide con uno de la despensa del usuario, usa esos macros si los tiene; si no, hazlo por aproximación. En cada item devuelto, añade "source": "pantry" | "approximation" indicando el origen.

Si el usuario registra un plato preparado con varios ingredientes (no un alimento único como "yogur natural"), añade además un campo opcional "recipe": { "ingredients": ["..."], "steps": ["..."] } con la receta breve. Omitelo para alimentos simples.

Estructura:
{
  "meal_name": "nombre corto del plato",
  "description": "descripcion breve",
  "items": [{"name": "ingrediente", "quantity_g": 150, "source": "pantry"}],
  "calories": 450,
  "protein_g": 30,
  "carbs_g": 40,
  "fat_g": 15,
  "fiber_g": 5,
  "confidence": 0.85,
  "recipe": { "ingredients": ["..."], "steps": ["..."] }
}
Calorias y macros en numeros (no strings). Confidence entre 0 y 1. Considera el perfil del usuario para mejor estimacion.

FIBRA OBLIGATORIA: el campo "fiber_g" debe estar SIEMPRE presente y ser un numero (nunca null, nunca ausente). Si tienes el dato exacto de una etiqueta o de la despensa, usalo. Si no, da una aproximacion razonable basada en valores tipicos para ese tipo de alimento (frutas ~2-4g/100g, verduras ~2-5g/100g, legumbres ~6-8g/100g, cereales integrales ~5-10g/100g, carnes/pescados/lacteos ~0g). Suma la fibra de todos los ingredientes del plato.

Responde SOLO con el JSON, sin texto adicional.`

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

    const model = hasImage ? "claude-sonnet-4-5" : "claude-haiku-4-5-20251001"

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
    let pantryBlock = ""
    if (Array.isArray(body.pantry_items) && body.pantry_items.length > 0) {
      const lines = body.pantry_items.map((p) => {
        const macros: string[] = []
        if (typeof p.calories_per_100g === "number") macros.push(`${p.calories_per_100g} kcal/100g`)
        if (typeof p.protein_g === "number") macros.push(`P ${p.protein_g}`)
        if (typeof p.carbs_g === "number") macros.push(`C ${p.carbs_g}`)
        if (typeof p.fat_g === "number") macros.push(`G ${p.fat_g}`)
        if (typeof p.fiber_g === "number") macros.push(`F ${p.fiber_g}`)
        return macros.length > 0 ? `- ${p.name} (${macros.join(", ")})` : `- ${p.name}`
      }).join("\n")
      pantryBlock = `\n\nDESPENSA DEL USUARIO (lista actual):\n${lines}\n`
    }

    content.push({
      type: "text",
      text: `${userContextPrompt}${pantryBlock}\n\nENTRADA DEL USUARIO:\n${
        hasImage ? "Foto del plato adjunta." : userText
      }\n\nAnaliza el plato y devuelve el JSON.`,
    })

    const text = await callAnthropic({
      model,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      max_tokens: 2048,
      temperature: 0.3,
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
