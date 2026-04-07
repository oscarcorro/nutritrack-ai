// Edge function: ai-chat-food
// Conversational helper that lets the user describe a meal in back-and-forth.
// Receives: { messages: Array<{role:"user"|"assistant", content:string}> }
// Returns: { reply: string, ready: boolean, summary?: string, ask?: string, model: string }

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface ChatMsg { role: "user" | "assistant"; content: string }
interface RequestBody { messages: ChatMsg[] }

const SYSTEM = `Eres un asistente nutricional conversacional en español. Habla de forma natural, breve y cercana, como un humano.

REGLAS DE FORMATO ESTRICTAS:
- NO uses markdown: nada de **negrita**, *cursiva*, _subrayado_, # títulos, > citas, listas con - o *, ni backticks.
- NO uses emojis salvo que el usuario los use primero.
- Escribe en frases planas, sin bullets. Si necesitas enumerar, hazlo en prosa ("primero..., luego..., y por último...").
- No menciones que eres una IA ni hables de ti mismo.

Tu único uso permitido de markdown es UN bloque JSON al final del mensaje, así:
\`\`\`json
{"ready": true, "summary": "..."}
\`\`\`
o
\`\`\`json
{"ready": false, "ask": "..."}
\`\`\`

Cuando tengas suficiente información (alimento, cantidad, preparación) usa ready:true con un summary completo en una frase. Si falta algo, usa ready:false con ask:"..." preguntando UNA sola cosa concreta. El bloque JSON va siempre al final, después del mensaje conversacional.`

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
