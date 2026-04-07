// Edge function: ai-chat-food
// Conversational helper that lets the user describe a meal in back-and-forth.
// Receives: { messages: Array<{role:"user"|"assistant", content:string}> }
// Returns: { reply: string, ready: boolean, summary?: string, ask?: string, model: string }

import { corsHeaders } from "../_shared/cors.ts"
import { callAnthropic } from "../_shared/anthropic.ts"
import { getUserClient, getUser, loadUserContext, buildUserContextPrompt } from "../_shared/supabase.ts"

interface ChatMsg { role: "user" | "assistant"; content: string }
interface RequestBody { messages: ChatMsg[] }

const SYSTEM = `Eres un asistente nutricional. El usuario te describe una comida o te hace preguntas. Responde en español, breve, conversacional. Cuando consideres que la descripción es completa y precisa para registrarla, devuelve además un bloque JSON al final: \`\`\`json {"ready": true, "summary": "..."} \`\`\`. Si falta info (cantidad, preparación, ingredientes), devuelve \`\`\`json {"ready": false, "ask": "..."} \`\`\` con la pregunta concreta.`

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

function stripTrailingJSON(text: string): string {
  return text.replace(/```(?:json)?\s*[\s\S]*?```\s*$/g, "").trim()
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
    const reply = stripTrailingJSON(text)
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
