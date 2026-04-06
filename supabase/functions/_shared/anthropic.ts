// Minimal Anthropic Messages API client for Deno edge functions
// Avoids pulling SDK; uses fetch directly.

export interface AnthropicTextBlock {
  type: "text"
  text: string
}
export interface AnthropicImageBlock {
  type: "image"
  source: { type: "base64"; media_type: string; data: string }
}
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicImageBlock

export interface AnthropicMessage {
  role: "user" | "assistant"
  content: string | AnthropicContentBlock[]
}

export interface AnthropicCallOptions {
  model: string
  system: string
  messages: AnthropicMessage[]
  max_tokens?: number
  temperature?: number
}

const API_URL = "https://api.anthropic.com/v1/messages"

export async function callAnthropic(opts: AnthropicCallOptions): Promise<string> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY")
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set")

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.max_tokens ?? 2048,
      temperature: opts.temperature ?? 0.7,
      system: opts.system,
      messages: opts.messages,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Anthropic API error ${res.status}: ${text}`)
  }

  const json = await res.json()
  const block = json.content?.[0]
  if (!block || block.type !== "text") throw new Error("No text response")
  return block.text as string
}

/**
 * Extracts JSON from a model response that may be wrapped in ```json fences
 * or contain extra prose.
 */
export function extractJSON<T = unknown>(text: string): T {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = fenceMatch ? fenceMatch[1] : text
  const start = candidate.indexOf("{")
  const startArr = candidate.indexOf("[")
  let from = start
  if (startArr !== -1 && (start === -1 || startArr < start)) from = startArr
  if (from === -1) throw new Error("No JSON found in model response")
  const body = candidate.slice(from)
  // Find matching end: try whole, then trim trailing garbage.
  try {
    return JSON.parse(body) as T
  } catch {
    // Attempt to cut at last } or ]
    const lastObj = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"))
    if (lastObj === -1) throw new Error("Invalid JSON in model response")
    return JSON.parse(body.slice(0, lastObj + 1)) as T
  }
}
