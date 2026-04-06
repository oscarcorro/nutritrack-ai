// Edge function: ai-analyze-pantry
// Input: { image_base64, media_type }
// Returns: { items: [{name, quantity_estimate, category}] }
// Uses Claude Sonnet vision to identify food items in a fridge/pantry photo.

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic, extractJSON, AnthropicContentBlock } from "../_shared/anthropic.ts"
import { getUserClient, getUser } from "../_shared/supabase.ts"

interface RequestBody {
  image_base64: string
  media_type?: string
}

interface DetectedItem {
  name: string
  quantity_estimate: string
  category: string
}

const MODEL = "claude-sonnet-4-6"

const SYSTEM = `Eres un experto en identificar alimentos en fotos de neveras y despensas.

Analiza la imagen y lista todos los alimentos que veas. Para cada uno estima la cantidad aproximada y clasifícalo por categoría (lácteos, verduras, frutas, carnes, pescados, cereales, legumbres, conservas, bebidas, condimentos, otros).

Si hay marcas visibles, inclúyelas en el nombre (p.ej. "Kefir de cabra Pastoret", "Leche desnatada Hacendado").

Devuelve SOLO JSON con esta estructura:
{
  "items": [
    {"name": "nombre del alimento con marca si se ve", "quantity_estimate": "1 L / 500g / 3 unidades", "category": "lacteos"}
  ]
}
Responde SOLO con el JSON.`

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
        text: "Identifica todos los alimentos que ves en esta foto y devuélvelos como JSON.",
      },
    ]

    const text = await callAnthropic({
      model: MODEL,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      max_tokens: 2048,
      temperature: 0.2,
    })

    const parsed = extractJSON<{ items: DetectedItem[] }>(text)
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
