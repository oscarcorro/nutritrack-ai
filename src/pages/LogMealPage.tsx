import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useCreateFoodLog } from "@/hooks/use-food-log"
import { useQuery } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { useAnalyzeFood, type AnalyzedFood } from "@/hooks/use-ai"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { MEAL_TYPE_LABELS } from "@/lib/nutrition"
import type { MealType, LogInputMethod } from "@/integrations/supabase/types"
import { Mic, Loader2, MicOff, Paperclip, Send, Sparkles } from "lucide-react"
import { compressImage, compressDataUrl } from "@/lib/image"

type ChatMessage =
  | { id: string; role: "user"; kind: "text"; text: string }
  | { id: string; role: "user"; kind: "image"; src: string }
  | { id: string; role: "user"; kind: "audio"; transcript: string }
  | { id: string; role: "assistant"; kind: "analyzing" }
  | { id: string; role: "assistant"; kind: "result"; result: AnalyzedFood }
  | { id: string; role: "assistant"; kind: "error"; text: string }
  | { id: string; role: "assistant"; kind: "saved"; mealName: string }

function ManualEntryForm({
  onSave,
  saving,
  initial,
}: {
  onSave: (data: {
    meal_name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
    meal_type: MealType
  }) => void
  saving: boolean
  initial?: AnalyzedFood | null
}) {
  const [mealName, setMealName] = useState(initial?.meal_name ?? "")
  const [calories, setCalories] = useState(initial ? String(Math.round(initial.calories)) : "")
  const [protein, setProtein] = useState(initial ? String(Math.round(initial.protein_g)) : "")
  const [carbs, setCarbs] = useState(initial ? String(Math.round(initial.carbs_g)) : "")
  const [fat, setFat] = useState(initial ? String(Math.round(initial.fat_g)) : "")
  const [fiber, setFiber] = useState(initial?.fiber_g != null ? String(Math.round(initial.fiber_g)) : "")
  const [mealType, setMealType] = useState<MealType>("lunch")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mealName) {
      toast.error("Escribe el nombre de la comida")
      return
    }
    if (!calories) {
      toast.error("Indica las calorías")
      return
    }
    onSave({
      meal_name: mealName,
      calories: parseFloat(calories),
      protein_g: parseFloat(protein) || 0,
      carbs_g: parseFloat(carbs) || 0,
      fat_g: parseFloat(fat) || 0,
      fiber_g: parseFloat(fiber) || 0,
      meal_type: mealType,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 mt-3">
      <div className="space-y-1.5">
        <Label htmlFor="meal-type">Tipo de comida</Label>
        <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(MEAL_TYPE_LABELS) as [MealType, string][]).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="meal-name">Nombre</Label>
        <Input id="meal-name" value={mealName} onChange={(e) => setMealName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="calories">Calorías</Label>
          <Input id="calories" type="number" value={calories} onChange={(e) => setCalories(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="protein">Proteína (g)</Label>
          <Input id="protein" type="number" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="carbs">Carbos (g)</Label>
          <Input id="carbs" type="number" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fat">Grasa (g)</Label>
          <Input id="fat" type="number" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
        <div className="space-y-1.5 col-span-2">
          <Label htmlFor="fiber">Fibra (g)</Label>
          <Input id="fiber" type="number" value={fiber} onChange={(e) => setFiber(e.target.value)} />
        </div>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={saving}>
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Guardar comida"}
      </Button>
    </form>
  )
}

export default function LogMealPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const createFoodLog = useCreateFoodLog()

  // Recent distinct meals (last 5)
  const { data: recentMeals } = useQuery({
    queryKey: ["recent-food-log", user?.id],
    queryFn: async () => {
      if (!user) return [] as string[]
      const { data, error } = await supabase
        .from("food_log")
        .select("meal_name, logged_at")
        .eq("user_id", user.id)
        .order("logged_at", { ascending: false })
        .limit(30)
      if (error) throw error
      const seen = new Set<string>()
      const out: string[] = []
      for (const row of (data ?? []) as Array<{ meal_name: string }>) {
        const name = (row.meal_name || "").trim()
        if (!name) continue
        const key = name.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        out.push(name)
        if (out.length >= 5) break
      }
      return out
    },
    enabled: !!user,
  })
  const analyzeFood = useAnalyzeFood()
  const [saving, setSaving] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      kind: "saved",
      mealName: "",
    },
  ])
  const [, setPendingResult] = useState<AnalyzedFood | null>(null)
  const [pendingMethod, setPendingMethod] = useState<LogInputMethod>("text")
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)

  // Composer state
  const [textInput, setTextInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Audio state
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null) // eslint-disable-line no-undef
  const audioTranscriptRef = useRef("")

  useEffect(() => {
    // autoscroll
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  // Read preselected method from navigation state
  const handledMethodRef = useRef(false)
  useEffect(() => {
    if (handledMethodRef.current) return
    const method = (location.state as { method?: "photo" | "audio" | "text" } | null)?.method
    if (!method) return
    handledMethodRef.current = true
    if (method === "photo") {
      // Slight delay so the input is mounted
      setTimeout(() => fileInputRef.current?.click(), 100)
    } else if (method === "audio") {
      setTimeout(() => startRecording(), 100)
    } else if (method === "text") {
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
    // Clear state so refresh doesn't re-trigger
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 140) + "px"
  }, [textInput])

  const pushMessage = (m: ChatMessage) => setMessages((prev) => [...prev, m])
  const replaceLastAnalyzing = (m: ChatMessage) =>
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((x) => x.kind === "analyzing")
      if (idx === -1) return [...prev, m]
      const realIdx = prev.length - 1 - idx
      const next = prev.slice()
      next[realIdx] = m
      return next
    })

  const runAnalyze = async (
    input: { text?: string; transcript?: string; image_base64?: string; media_type?: string },
    method: LogInputMethod,
    rawText: string | null,
  ) => {
    pushMessage({ id: `a-${Date.now()}`, role: "assistant", kind: "analyzing" })
    try {
      const result = await analyzeFood.mutateAsync(input)
      setPendingResult(result)
      setPendingMethod(method)
      setPendingRawText(rawText)
      replaceLastAnalyzing({ id: `r-${Date.now()}`, role: "assistant", kind: "result", result })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error al analizar"
      replaceLastAnalyzing({ id: `e-${Date.now()}`, role: "assistant", kind: "error", text: msg })
      toast.error(msg)
    }
  }

  const handleSendText = async () => {
    const text = textInput.trim()
    if (!text) return
    setTextInput("")
    pushMessage({ id: `u-${Date.now()}`, role: "user", kind: "text", text })
    await runAnalyze({ text }, "text", text)
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      pushMessage({ id: `u-${Date.now()}`, role: "user", kind: "image", src: dataUrl })
      const compressed = await compressDataUrl(dataUrl)
      await runAnalyze({ image_base64: compressed, media_type: "image/jpeg" }, "photo", null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer foto")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error("Tu navegador no soporta reconocimiento de voz")
      return
    }
    audioTranscriptRef.current = ""
    const recognition = new SpeechRecognition()
    recognition.lang = "es-ES"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: SpeechRecognitionEvent) => { // eslint-disable-line no-undef
      let text = ""
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      audioTranscriptRef.current = text
    }
    recognition.onerror = () => {
      toast.error("Error en el reconocimiento de voz")
      setIsRecording(false)
    }
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  const stopRecording = async () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
    const transcript = audioTranscriptRef.current.trim()
    if (!transcript) {
      toast.error("No se pudo escuchar nada")
      return
    }
    pushMessage({ id: `u-${Date.now()}`, role: "user", kind: "audio", transcript })
    await runAnalyze({ transcript }, "audio", transcript)
  }

  const handleSave = async (data: {
    meal_name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    fiber_g: number
    meal_type: MealType
  }) => {
    setSaving(true)
    try {
      await createFoodLog.mutateAsync({
        logged_at: new Date().toISOString(),
        meal_type: data.meal_type,
        input_method: pendingMethod,
        raw_text: pendingRawText,
        photo_url: null,
        audio_url: null,
        meal_name: data.meal_name,
        description: null,
        items: [],
        calories: data.calories,
        protein_g: data.protein_g,
        carbs_g: data.carbs_g,
        fat_g: data.fat_g,
        fiber_g: data.fiber_g || null,
        meal_plan_item_id: null,
        ai_confidence: null,
        ai_model: null,
      })
      toast.success("Comida registrada")
      navigate("/inicio")
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const isAnalyzing = analyzeFood.isPending

  return (
    <div className="flex flex-col h-[calc(100svh-9rem)]">
      <h2 className="text-2xl font-bold mb-3">Registrar comida</h2>

      {/* Chat scroll area */}
      <div
        ref={scrollRef}
        data-tour="log-tabs"
        className="flex-1 overflow-y-auto space-y-3 pb-3"
      >
        {/* Intro bubble */}
        <div className="flex items-start gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-base max-w-[85%]">
            Cuentame que has comido. Puedes escribirlo, hacerle una foto o dictarlo por voz.
          </div>
        </div>

        {messages.map((m) => {
          if (m.id === "welcome") return null
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <div className="rounded-2xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-base max-w-[85%]">
                  {m.kind === "text" && <p>{m.text}</p>}
                  {m.kind === "audio" && <p className="italic">{m.transcript}</p>}
                  {m.kind === "image" && (
                    <img src={m.src} alt="Foto" className="rounded-xl max-h-56" />
                  )}
                </div>
              </div>
            )
          }
          // assistant messages
          return (
            <div key={m.id} className="flex items-start gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="max-w-[90%] flex-1">
                {m.kind === "analyzing" && (
                  <div className="space-y-2">
                    <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 inline-flex items-center gap-2 nt-pulse-soft">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span className="text-base">Analizando</span>
                      <span className="inline-flex gap-0.5" aria-hidden>
                        <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                        <span className="w-1 h-1 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                        <span className="w-1 h-1 rounded-full bg-primary animate-bounce" />
                      </span>
                    </div>
                    <Card className="animate-pulse">
                      <CardContent className="p-3 space-y-3">
                        <div className="h-4 w-2/3 rounded bg-secondary" />
                        <div className="h-9 w-full rounded bg-secondary" />
                        <div className="grid grid-cols-2 gap-2">
                          <div className="h-9 rounded bg-secondary" />
                          <div className="h-9 rounded bg-secondary" />
                          <div className="h-9 rounded bg-secondary" />
                          <div className="h-9 rounded bg-secondary" />
                        </div>
                        <div className="h-10 w-full rounded bg-secondary" />
                      </CardContent>
                    </Card>
                  </div>
                )}
                {m.kind === "error" && (
                  <div className="rounded-2xl rounded-tl-sm bg-destructive/10 text-destructive px-3 py-2 text-sm">
                    {m.text}
                  </div>
                )}
                {m.kind === "result" && (
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-sm text-muted-foreground mb-1">
                        Revisa y ajusta antes de guardar.
                      </p>
                      <ManualEntryForm
                        onSave={handleSave}
                        saving={saving}
                        initial={m.result}
                      />
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Recientes */}
      {recentMeals && recentMeals.length > 0 && (
        <div className="pt-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Recientes</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {recentMeals.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setTextInput(name)
                  setTimeout(() => textareaRef.current?.focus(), 0)
                }}
                className="shrink-0 rounded-full border border-border bg-secondary/60 hover:bg-secondary px-3 min-h-[40px] text-sm font-medium"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer */}
      <div className="sticky bottom-0 bg-background pt-2">
        <div className="flex items-end gap-2 rounded-2xl border border-border bg-background p-2 shadow-sm">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="flex items-center justify-center w-11 h-11 rounded-full hover:bg-secondary text-muted-foreground shrink-0"
            aria-label="Adjuntar foto"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleFileSelect}
          />
          <textarea
            ref={textareaRef}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSendText()
              }
            }}
            placeholder="Escribe lo que has comido..."
            rows={1}
            disabled={isAnalyzing}
            className="flex-1 resize-none bg-transparent outline-none text-base py-2 min-h-[44px] max-h-[140px] placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isAnalyzing}
            className={`flex items-center justify-center w-11 h-11 rounded-full shrink-0 ${
              isRecording ? "bg-destructive text-destructive-foreground" : "hover:bg-secondary text-muted-foreground"
            }`}
            aria-label={isRecording ? "Detener grabacion" : "Grabar audio"}
          >
            {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={handleSendText}
            disabled={isAnalyzing || !textInput.trim()}
            className="flex items-center justify-center w-11 h-11 rounded-full bg-primary text-primary-foreground shrink-0 disabled:opacity-40"
            aria-label="Enviar"
          >
            {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
          </button>
        </div>
        {isRecording && (
          <p className="text-xs text-center text-muted-foreground mt-2 flex items-center justify-center gap-2">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            Escuchando... toca el microfono para parar.
          </p>
        )}
      </div>

    </div>
  )
}
