import { useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react"
import { toast } from "sonner"

interface Props {
  onSubmit: (activities: string, preferences: string) => void
  generating: boolean
}

// Keyword-based suggestions — quick chips the user can toggle
function suggestChips(text: string): string[] {
  const t = text.toLowerCase()
  const chips: string[] = []
  if (/(gym|gimnasio|pesas|entreno|entrenar)/.test(t)) {
    chips.push("Comer algo antes del entreno")
    chips.push("Mas proteina post-entreno")
  }
  if (/(bici|ciclism|correr|running|maraton|senderismo|caminata larga)/.test(t)) {
    chips.push("Cargar hidratos antes")
    chips.push("Snack energetico a mano")
  }
  if (/(sedentari|casa|oficina|trabajar)/.test(t)) {
    chips.push("Cena ligera")
    chips.push("Menos hidratos")
  }
  if (/(partido|futbol|padel|tenis|baloncesto)/.test(t)) {
    chips.push("Hidratos antes del partido")
  }
  return Array.from(new Set(chips))
}

// Narrow type for Web Speech API (avoids `any`)
interface SpeechRecognitionResultLike {
  0: { transcript: string }
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

export function DailyContextForm({ onSubmit, generating }: Props) {
  const [text, setText] = useState("")
  const [selectedChips, setSelectedChips] = useState<Record<string, boolean>>({})
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const chips = useMemo(() => suggestChips(text), [text])

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
    const rec = new Ctor()
    rec.lang = "es-ES"
    rec.interimResults = true
    rec.continuous = true
    rec.onresult = (e) => {
      let finalText = ""
      for (let i = e.resultIndex; i < e.results.length; i++) {
        finalText += e.results[i][0].transcript
      }
      setText((prev) => (prev ? prev + " " : "") + finalText)
    }
    rec.onerror = () => setListening(false)
    rec.onend = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  const handleSubmit = () => {
    const active = chips.filter((c) => selectedChips[c])
    const prefs = active.join(". ")
    onSubmit(text.trim(), prefs)
  }

  const handleSkip = () => onSubmit("", "")

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Cuentame que vas a hacer hoy</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Dime tu dia (trabajo, deporte, horarios) y adaptamos el plan. Puedes escribirlo o dictarlo.
        </p>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej: Hoy voy a montar en bici de 9 a 12 y al gimnasio a las 19. El resto del dia trabajando en casa."
          rows={4}
          className="text-base"
        />

        <Button
          variant={listening ? "destructive" : "outline"}
          size="sm"
          onClick={toggleListen}
          className="w-full"
        >
          {listening ? (
            <><MicOff className="h-4 w-4 mr-2" /> Parar dictado</>
          ) : (
            <><Mic className="h-4 w-4 mr-2" /> Dictar por voz</>
          )}
        </Button>

        {chips.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Ajustes rapidos</p>
            <div className="flex flex-wrap gap-2">
              {chips.map((c) => (
                <Badge
                  key={c}
                  variant={selectedChips[c] ? "success" : "outline"}
                  className="cursor-pointer py-2 px-3 text-sm"
                  onClick={() => setSelectedChips((s) => ({ ...s, [c]: !s[c] }))}
                >
                  {c}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handleSkip} disabled={generating}>
            Saltar
          </Button>
          <Button className="flex-1" onClick={handleSubmit} disabled={generating}>
            {generating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Generando...</> : "Generar plan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
