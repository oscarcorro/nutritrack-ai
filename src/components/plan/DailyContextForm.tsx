import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Mic, MicOff, Loader2, Sparkles, Send, Check } from "lucide-react"
import { toast } from "sonner"
import type { MealType } from "@/integrations/supabase/types"
import { MEAL_TYPE_LABELS } from "@/lib/nutrition"

interface Props {
  onSubmit: (activities: string, preferences: string) => void
  generating: boolean
  loggedMealTypes?: MealType[]
}

const ALL_MEAL_TYPES: MealType[] = [
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
]

interface SpeechRecognitionResultLike {
  0: { transcript: string }
  isFinal: boolean
}
interface SpeechRecognitionEventLike {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResultLike }
}
interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((e: SpeechRecognitionEventLike) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

export function DailyContextForm({ onSubmit, generating, loggedMealTypes = [] }: Props) {
  const [text, setText] = useState("")
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const baseTextRef = useRef("")

  const missing = useMemo(
    () => ALL_MEAL_TYPES.filter((t) => !loggedMealTypes.includes(t)),
    [loggedMealTypes],
  )
  const allLogged = missing.length === 0
  const someLogged = loggedMealTypes.length > 0 && !allLogged

  const headline = allLogged
    ? "Ya has registrado todas las comidas de hoy"
    : someLogged
      ? missing.length === 1
        ? `¿Te ayudo con ${MEAL_TYPE_LABELS[missing[0]].toLowerCase()}?`
        : `¿Necesitas ayuda con ${MEAL_TYPE_LABELS[missing[0]].toLowerCase()}?`
      : "Cuentame que vas a hacer hoy"

  const placeholder = someLogged
    ? "Opcional: ej. 'algo ligero', 'sin pescado'..."
    : "Ej: bici 9-12, gym 19h, resto en casa"

  const toggleListen = () => {
    const w = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionLike
      webkitSpeechRecognition?: new () => SpeechRecognitionLike
    }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      toast.error("Tu navegador no soporta dictado por voz")
      return
    }
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    baseTextRef.current = text
    const rec = new Ctor()
    rec.lang = "es-ES"
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e) => {
      let finalAdded = ""
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i]
        if (r.isFinal) finalAdded += r[0].transcript
      }
      if (finalAdded) {
        const sep = baseTextRef.current && !baseTextRef.current.endsWith(" ") ? " " : ""
        baseTextRef.current = baseTextRef.current + sep + finalAdded.trim()
        setText(baseTextRef.current)
      }
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  const handleSubmit = () => {
    onSubmit(text.trim(), "")
  }

  if (allLogged) {
    return (
      <Card className="bg-green-50 border-green-200">
        <CardContent className="p-5 text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
            <Check className="h-6 w-6 text-green-700" />
          </div>
          <p className="text-base font-semibold">{headline}</p>
          <p className="text-sm text-muted-foreground">Buen trabajo. Vuelve mañana para tu siguiente plan.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary shrink-0" />
          <h3 className="text-base font-semibold leading-tight">{headline}</h3>
        </div>

        <div className="flex items-end gap-2 rounded-2xl border border-border p-2">
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              baseTextRef.current = e.target.value
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                handleSubmit()
              }
            }}
            placeholder={placeholder}
            disabled={generating}
            className="flex-1 bg-transparent outline-none text-base px-2 min-h-[44px] placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={toggleListen}
            disabled={generating}
            className={`flex items-center justify-center w-11 h-11 rounded-full shrink-0 ${
              listening ? "bg-destructive text-destructive-foreground" : "hover:bg-secondary text-muted-foreground"
            }`}
            aria-label={listening ? "Parar dictado" : "Dictar"}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={generating}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground shrink-0 disabled:opacity-40"
            aria-label="Generar plan"
          >
            {generating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>

        {!someLogged && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSubmit("", "")}
            disabled={generating}
            className="w-full text-muted-foreground"
          >
            Saltar y generar sin contexto
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
