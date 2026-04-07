// Edge function: ai-analyze-nutrition-label
// Input: { image_base64, media_type, product_hint? }
// Returns: { name, brand, calories_per_100g, protein_g_per_100g, carbs_g_per_100g,
//            fat_g_per_100g, fiber_g_per_100g, serving_unit }
//
// Reads a photo of a product's nutrition label and extracts the macros per 100g
// (or per 100ml for liquids). If the label is unreadable, optionally uses the
// product_hint + web_search to look up the brand's published values.

import { corsHeaders } from "../_shared/cors.ts"
import {
  callAnthropic,
  extractJSON,
  AnthropicContentBlock,
} from "../_shared/anthropic.ts"
import { getUserClient, getUser } from "../_shared/supabase.ts"

interface RequestBody {
  image_base64: string
  media_type?: string
  product_hint?: string
}

interface Nutrition {
  name: string
  brand: string | null
  calories_per_100g: number | null
  protein_g_per_100g: number | null
  carbs_g_per_100g: number | null
  fat_g_per_100g: number | null
  fiber_g_per_100g: number | null
  serving_unit: "g" | "ml" | null
}

const MODEL = "claude-sonnet-4-5"

const SYSTEM = `Eres un experto en etiquetas nutricionales. Te paso una foto de un producto (o de su etiqueta) y debes extraer con precisión los valores nutricionales POR 100 g (o por 100 ml si es un liquido).

Reglas:
- Si la etiqueta indica valores por porcion Y por 100g, usa SIEMPRE los de 100g.
- Si solo hay por porcion, calcula los valores por 100g a partir de la porcion.
- Si el producto es liquido (leche, zumo, yogur bebible), usa serving_unit="ml".
- Si es solido, usa serving_unit="g".
- Incluye el nombre del producto y la marca si se ven.
- Si la etiqueta no es legible o no esta visible, usa tu conocimiento de etiquetas tipicas del producto que identifiques en la foto o del hint del usuario.
- Nunca inventes numeros — si algo no se puede determinar, devuelve null para ese campo.

Devuelve SOLO JSON con esta estructura exacta:
{
  "name": "Nombre del producto",
  "brand": "Marca o null",
  "calories_per_100g": 95,
  "protein_g_per_100g": 8.5,
  "carbs_g_per_100g": 4.2,
  "fat_g_per_100g": 5.0,
  "fiber_g_per_100g": 0,
  "serving_unit": "g"
}
Todos los numericos como numeros (no strings). Responde SOLO con el JSON.`

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const client = getUserClient(req)
    await getUser(client)

    const body = (await req.json()) as RequestBody
    if (!body.image_base64) {
      return new Response(JSON.stringify({ error: "image_base64 required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const content: AnthropicContentBlock[] = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: body.media_type || "image/jpeg",
          data: body.image_base64.replace(/^data:image\/\w+;base64,/, ""),
        },
      },
      {
        type: "text",
        text: body.product_hint
          ? `Extrae los valores nutricionales por 100g de este producto. Pista del usuario: "${body.product_hint}". Si la etiqueta no es legible usa tu conocimiento de etiquetas tipicas.`
          : "Extrae los valores nutricionales por 100g de este producto. Si la etiqueta no es legible usa tu conocimiento de etiquetas tipicas.",
      },
    ]

    const text = await callAnthropic({
      model: MODEL,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      max_tokens: 1024,
      temperature: 0.1,
    })

    const parsed = extractJSON<Nutrition>(text)
    if (!parsed) throw new Error("No se pudo extraer la informacion nutricional")

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
