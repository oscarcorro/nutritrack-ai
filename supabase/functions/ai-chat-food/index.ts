// Edge function: ai-chat-food
// Conversational helper that lets the user describe a meal in back-and-forth.
// Receives: { messages: Array<{role:"user"|"assistant", content:string}> }
// Returns: { reply: string, ready: boolean, summary?: string, ask?: string, model: string }

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface ChatMsg { role: "user" | "assistant"; content: string }
interface RequestBody { messages: ChatMsg[] }

const SYSTEM = `Eres un asistente nutricional en español. Tu trabajo principal es REGISTRAR comidas lo mas rapido posible.

PRINCIPIO FUNDAMENTAL:
El usuario te dice lo que ha comido y tu lo registras. ASUME que el usuario ya te ha dado TODA la informacion que tiene. NO preguntes detalles adicionales como tipo de pan, marca, metodo de coccion, acompañamientos, etc. Si dice "50g de pan", registra 50g de pan generico. Si dice "pasta", registra una racion estandar de pasta (80-100g en crudo). Si quisiera ser mas especifico, el ya te lo habria dicho.

REGLA DE DESPENSA:
El usuario tiene una despensa registrada en la app. Si dice un alimento que coincide con algo de su despensa (por nombre o tipo), USA automaticamente el de la despensa sin preguntar. Ejemplo: si tiene "Pan Bimbo integral" en despensa y dice "pan", usa Pan Bimbo integral. NUNCA preguntes "¿es el pan que tienes en la despensa?".

CUANDO USAR ready:true (CASI SIEMPRE):
- El usuario menciona al menos UN alimento → ready:true
- No dice cantidad → usa racion estandar y ready:true
- No dice preparacion → asume la mas comun y ready:true
- Dice varios alimentos juntos → ready:true con todos

CUANDO USAR ready:false (MUY RARO):
- El mensaje NO contiene ningun alimento identificable (ej: "he comido", "acabo de comer", sin decir que)
- El usuario hace una PREGUNTA sobre nutricion en vez de registrar comida

FORMATO DEL SUMMARY:
Cuando ready:true, el summary debe ser una descripcion completa de todo lo que el usuario ha dicho que ha comido, con cantidades (reales o estimadas). Ejemplo: "100g de pasta integral con 150g de pollo a la plancha y ensalada mixta (150g)"

REGLAS DE FORMATO:
- NO uses markdown: nada de **negrita**, *cursiva*, # titulos, listas con - o *.
- NO uses emojis salvo que el usuario los use primero.
- Frases cortas y directas. Nada de "¡genial!" ni "¡perfecto!".
- No menciones que eres una IA.
- Cuando registres (ready:true), responde con algo breve como "Registrado." o "Apuntado." seguido del bloque JSON.

Tu unico uso permitido de markdown es UN bloque JSON al final:
\`\`\`json
{"ready": true, "summary": "descripcion completa con cantidades"}
\`\`\`
o
\`\`\`json
{"ready": false, "ask": "pregunta concreta"}
\`\`\`

El bloque JSON va siempre al final, despues del mensaje.`

function parseTrailingJSON(text: string): { ready?: boolean; summary?: string; ask?: string } | null {
  const matches = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)]
  if (matches.length === 0) return null
  const last = matches[matches.length - 1][1]
  try {
    return JSON.parse(last.trim())
  } catch {
    return null
  }
}

function stripMarkdown(text: string): string {
  return text
    // remove ALL fenced code blocks (json or otherwise)
    .replace(/```[\s\S]*?```/g, "")
    // inline code
    .replace(/`([^`]+)`/g, "$1")
    // bold **x** or __x__
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    // italic *x* or _x_
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1$2")
    .replace(/(^|[^_])_([^_\n]+)_/g, "$1$2")
    // headings
    .replace(/^#{1,6}\s+/gm, "")
    // blockquotes
    .replace(/^>\s?/gm, "")
    // bullet/numbered list markers at line start
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // collapse triple+ newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

  try {
    const client = getUserClient(req)
    const user = await getUser(client)
    const ctx = await loadUserContext(client, user.id)
    const userContextPrompt = buildUserContextPrompt(ctx)

    const body = (await req.json()) as RequestBody
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      return new Response(JSON.stringify({ error: "No messages" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const model = "claude-haiku-4-5-20251001"

    const messages = body.messages.map((m, i) => {
      if (i === 0 && m.role === "user") {
        return {
          role: "user" as const,
          content: `${userContextPrompt}\n\n${m.content}`,
        }
      }
      return { role: m.role, content: m.content }
    })

    const text = await callAnthropic({
      model,
      system: SYSTEM,
      messages,
      max_tokens: 1024,
      temperature: 0.5,
    })

    const parsed = parseTrailingJSON(text)
    const reply = stripMarkdown(text)
    const ready = !!parsed?.ready
    const result = {
      reply,
      ready,
      summary: parsed?.summary,
      ask: parsed?.ask,
      model,
    }

    return new Response(JSON.stringify(result), {
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
