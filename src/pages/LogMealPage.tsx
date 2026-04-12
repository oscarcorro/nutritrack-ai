import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useCreateFoodLog, useTodayFoodLog, useUpdateFoodLog } from "@/hooks/use-food-log"
import { useAnalyzeFood, useChatFood, type AnalyzedFood } from "@/hooks/use-ai"
import { addRecipe, isRecipeSaved } from "@/lib/recipes"
import { usePantry } from "@/hooks/use-pantry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { MEAL_TYPE_LABELS } from "@/lib/nutrition"
import type { MealType, LogInputMethod, FoodLog } from "@/integrations/supabase/types"
import { Mic, Loader2, MicOff, Send, Sparkles, Star, Package, Sigma, ChefHat, ChevronDown, ChevronUp, Camera } from "lucide-react"
import { compressImage, compressDataUrl } from "@/lib/image"

const FAVS_KEY = "nt:favorites:v1"
const FAVS_MAX = 30

type Favorite = { name: string; kcal: number; p: number; c: number; g: number; fiber: number }

function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}
function saveFavorites(list: Favorite[]) {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(list.slice(0, FAVS_MAX)))
  } catch {
    // ignore
  }
}
function isFavorited(list: Favorite[], name: string): boolean {
  const k = name.trim().toLowerCase()
  return list.some((f) => f.name.trim().toLowerCase() === k)
}

// --- Chat persistence (daily) ---
const CHAT_STORAGE_KEY = "nt:chat-daily"

function getMadridDate(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Madrid" })
}

interface PersistedChat {
  date: string
  messages: ChatMessage[]
  chatHistory: { role: "user" | "assistant"; content: string }[]
}

function loadTodayChat(): PersistedChat | null {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw) as PersistedChat
    if (data.date !== getMadridDate()) {
      localStorage.removeItem(CHAT_STORAGE_KEY)
      return null
    }
    return data
  } catch {
    return null
  }
}

function saveTodayChat(messages: ChatMessage[], chatHistory: { role: "user" | "assistant"; content: string }[]) {
  const persistable = messages
    .filter((m) => m.kind !== "analyzing" && m.kind !== "thinking")
    .map((m) => (m.kind === "image" ? { ...m, src: "" } : m))
  try {
    localStorage.setItem(
      CHAT_STORAGE_KEY,
      JSON.stringify({ date: getMadridDate(), messages: persistable, chatHistory })
    )
  } catch {
    // storage full — ignore
  }
}

function currentMealSlot(): MealType {
  try {
    const hh = parseInt(
      new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        hour12: false,
      }).format(new Date()),
      10,
    )
    if (hh < 10) return "breakfast"
    if (hh < 12) return "morning_snack"
    if (hh < 16) return "lunch"
    if (hh < 19) return "afternoon_snack"
    return "dinner"
  } catch {
    return "lunch"
  }
}

type ChatMessage =
  | { id: string; role: "user"; kind: "text"; text: string }
  | { id: string; role: "user"; kind: "image"; src: string }
  | { id: string; role: "user"; kind: "audio"; transcript: string }
  | { id: string; role: "assistant"; kind: "analyzing" }
  | { id: string; role: "assistant"; kind: "result"; result: AnalyzedFood }
  | { id: string; role: "assistant"; kind: "error"; text: string }
  | { id: string; role: "assistant"; kind: "saved"; mealName: string }
  | { id: string; role: "assistant"; kind: "text"; text: string }
  | { id: string; role: "assistant"; kind: "thinking" }

function ManualEntryForm({
  onSave,
  saving,
  initial,
  isUpdate,
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
  isUpdate?: boolean
}) {
  const [favs, setFavs] = useState<Favorite[]>(() => loadFavorites())
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

  const fav = isFavorited(favs, mealName)
  const toggleFav = () => {
    const name = mealName.trim()
    if (!name) {
      toast.error("Escribe el nombre primero")
      return
    }
    const k = name.toLowerCase()
    let next: Favorite[]
    if (favs.some((f) => f.name.trim().toLowerCase() === k)) {
      next = favs.filter((f) => f.name.trim().toLowerCase() !== k)
      toast.success("Quitado de favoritos")
    } else {
      const entry: Favorite = {
        name,
        kcal: parseFloat(calories) || 0,
        p: parseFloat(protein) || 0,
        c: parseFloat(carbs) || 0,
        g: parseFloat(fat) || 0,
        fiber: parseFloat(fiber) || 0,
      }
      next = [entry, ...favs.filter((f) => f.name.trim().toLowerCase() !== k)].slice(0, FAVS_MAX)
      toast.success("Añadido a favoritos")
    }
    setFavs(next)
    saveFavorites(next)
    window.dispatchEvent(new Event("nt:favorites-changed"))
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
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" size="lg" disabled={saving}>
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : isUpdate ? "Actualizar comida" : "Guardar comida"}
        </Button>
        <button
          type="button"
          onClick={toggleFav}
          aria-label={fav ? "Quitar de favoritos" : "Marcar como favorito"}
          className={`flex items-center justify-center w-12 h-12 rounded-md border ${
            fav ? "bg-amber-100 border-amber-300 text-amber-600" : "border-border bg-secondary/60 text-muted-foreground"
          }`}
        >
          <Star className={`h-5 w-5 ${fav ? "fill-amber-500" : ""}`} />
        </button>
      </div>
    </form>
  )
}

function SourceBadges({ items }: { items: AnalyzedFood["items"] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((it, idx) => {
        const isPantry = it.source === "pantry"
        return (
          <span
            key={idx}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              isPantry
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                : "bg-secondary text-muted-foreground border border-border"
            }`}
            title={isPantry ? "Macros de la despensa" : "Macros aproximados"}
          >
            {isPantry ? <Package className="h-3 w-3" /> : <Sigma className="h-3 w-3" />}
            <span className="truncate max-w-[120px]">{it.name}</span>
          </span>
        )
      })}
    </div>
  )
}

function RecipeSection({ result }: { result: AnalyzedFood }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(() => isRecipeSaved(result.meal_name))
  if (!result.recipe || (result.recipe.ingredients.length === 0 && result.recipe.steps.length === 0)) {
    return null
  }
  const handleSave = () => {
    if (saved) {
      toast.info("Ya está guardada en tus recetas")
      return
    }
    addRecipe({
      name: result.meal_name,
      ingredients: result.recipe!.ingredients,
      steps: result.recipe!.steps,
      kcal: Math.round(result.calories),
    })
    setSaved(true)
    toast.success("Receta guardada en Mis recetas")
  }
  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold"
      >
        <span className="flex items-center gap-2">
          <ChefHat className="h-4 w-4 text-primary" />
          Receta
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {result.recipe.ingredients.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Ingredientes</p>
              <ul className="list-disc list-inside space-y-0.5">
                {result.recipe.ingredients.map((i, idx) => (
                  <li key={idx}>{i}</li>
                ))}
              </ul>
            </div>
          )}
          {result.recipe.steps.length > 0 && (
            <div>
              <p className="font-semibold mb-1">Pasos</p>
              <ol className="list-decimal list-inside space-y-1">
                {result.recipe.steps.map((s, idx) => (
                  <li key={idx}>{s}</li>
                ))}
              </ol>
            </div>
          )}
          <Button
            type="button"
            variant={saved ? "secondary" : "outline"}
            size="sm"
            className="w-full"
            onClick={handleSave}
            disabled={saved}
          >
            <Star className={`h-4 w-4 mr-2 ${saved ? "fill-amber-500 text-amber-500" : ""}`} />
            {saved ? "Guardada en mis recetas" : "Guardar en mis recetas"}
          </Button>
        </div>
      )}
    </div>
  )
}

export default function LogMealPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const createFoodLog = useCreateFoodLog()
  const updateFoodLog = useUpdateFoodLog()
  const analyzeFood = useAnalyzeFood()
  const chatFood = useChatFood()
  const { data: pantry } = usePantry()
  const { data: todayLogs } = useTodayFoodLog()

  // Load persisted chat for today
  const persistedRef = useRef(loadTodayChat())
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>(
    () => persistedRef.current?.chatHistory ?? []
  )
  const [saving, setSaving] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>(
    () => persistedRef.current?.messages ?? []
  )
  const [, setPendingResult] = useState<AnalyzedFood | null>(null)
  const [pendingMethod, setPendingMethod] = useState<LogInputMethod>("text")
  const [pendingRawText, setPendingRawText] = useState<string | null>(null)
  const [editingLogId, setEditingLogId] = useState<string | null>(null)

  // Composer state
  const [textInput, setTextInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Favorites
  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites())
  useEffect(() => {
    const handler = () => setFavorites(loadFavorites())
    window.addEventListener("nt:favorites-changed", handler)
    window.addEventListener("storage", handler)
    return () => {
      window.removeEventListener("nt:favorites-changed", handler)
      window.removeEventListener("storage", handler)
    }
  }, [])

  // Audio state
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null) // eslint-disable-line no-undef
  const audioTranscriptRef = useRef("")

  useEffect(() => {
    // autoscroll
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages])

  // Persist chat to localStorage on every change (skip transient states)
  useEffect(() => {
    const hasContent = messages.some((m) => m.kind !== "analyzing" && m.kind !== "thinking")
    if (hasContent && messages.length > 0) {
      saveTodayChat(messages, chatHistory)
    }
  }, [messages, chatHistory])

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
      const pantry_items = (pantry ?? []).map((p) => ({
        name: p.name,
        calories_per_100g: p.calories_per_100g ?? undefined,
        protein_g: p.protein_g_per_100g ?? undefined,
        carbs_g: p.carbs_g_per_100g ?? undefined,
        fat_g: p.fat_g_per_100g ?? undefined,
        fiber_g: p.fiber_g_per_100g ?? undefined,
      }))
      const result = await analyzeFood.mutateAsync({ ...input, pantry_items })
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

  const replaceLastThinking = (m: ChatMessage) =>
    setMessages((prev) => {
      const idx = [...prev].reverse().findIndex((x) => x.kind === "thinking")
      if (idx === -1) return [...prev, m]
      const realIdx = prev.length - 1 - idx
      const next = prev.slice()
      next[realIdx] = m
      return next
    })

  const handleSendChat = async () => {
    const text = textInput.trim()
    if (!text) return
    setTextInput("")
    pushMessage({ id: `u-${Date.now()}`, role: "user", kind: "text", text })
    const nextHistory = [...chatHistory, { role: "user" as const, content: text }]
    setChatHistory(nextHistory)
    pushMessage({ id: `t-${Date.now()}`, role: "assistant", kind: "thinking" })
    try {
      // Build today_meals for the AI context
      const today_meals = (todayLogs ?? []).map((l) => ({
        name: l.meal_name,
        kcal: Math.round(l.calories ?? 0),
        meal_type: MEAL_TYPE_LABELS[l.meal_type as MealType] ?? l.meal_type ?? "",
      }))
      const reply = await chatFood.mutateAsync({ messages: nextHistory, today_meals })
      const assistantContent = reply.reply || (reply.ask ?? "")
      setChatHistory([...nextHistory, { role: "assistant", content: assistantContent }])
      if (reply.ready && reply.summary) {
        // Check if this is a modification of an existing meal
        let isModify = false
        if (reply.modify && todayLogs) {
          const modifyLower = reply.modify.toLowerCase()
          const target = todayLogs.find(
            (l) => l.meal_name.toLowerCase() === modifyLower
          ) ?? todayLogs.find(
            (l) => l.meal_name.toLowerCase().includes(modifyLower) ||
                   modifyLower.includes(l.meal_name.toLowerCase())
          )
          if (target) {
            setEditingLogId(target.id)
            isModify = true
          }
        }
        if (!isModify) {
          setEditingLogId(null)
        }
        replaceLastThinking({
          id: `tx-${Date.now()}`,
          role: "assistant",
          kind: "text",
          text: assistantContent || (isModify ? "Actualizado." : "Registrado."),
        })
        await runAnalyze({ text: reply.summary }, "text", reply.summary)
      } else {
        replaceLastThinking({
          id: `tx-${Date.now()}`,
          role: "assistant",
          kind: "text",
          text: assistantContent || reply.ask || "¿Puedes darme más detalle?",
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error en el chat"
      replaceLastThinking({ id: `e-${Date.now()}`, role: "assistant", kind: "error", text: msg })
      toast.error(msg)
    }
  }

  const handleSendText = async () => {
    const text = textInput.trim()
    if (!text) return
    await handleSendChat()
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
      if (editingLogId) {
        await updateFoodLog.mutateAsync({
          id: editingLogId,
          updates: {
            meal_name: data.meal_name,
            calories: data.calories,
            protein_g: data.protein_g,
            carbs_g: data.carbs_g,
            fat_g: data.fat_g,
            fiber_g: data.fiber_g || null,
            meal_type: data.meal_type,
          },
        })
        toast.success("Comida actualizada")
        setEditingLogId(null)
      } else {
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
      }
      // Stay on page — show confirmation in chat instead of navigating away
      pushMessage({
        id: `s-${Date.now()}`,
        role: "assistant",
        kind: "saved",
        mealName: data.meal_name,
      })
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const quickLogFavorite = async (fav: Favorite) => {
    try {
      await createFoodLog.mutateAsync({
        logged_at: new Date().toISOString(),
        meal_type: currentMealSlot(),
        input_method: "text",
        raw_text: fav.name,
        photo_url: null,
        audio_url: null,
        meal_name: fav.name,
        description: null,
        items: [],
        calories: fav.kcal,
        protein_g: fav.p,
        carbs_g: fav.c,
        fat_g: fav.g,
        fiber_g: fav.fiber || null,
        meal_plan_item_id: null,
        ai_confidence: null,
        ai_model: null,
      })
      toast.success("Añadido a tu registro")
    } catch {
      toast.error("Error al guardar")
    }
  }

  const isAnalyzing = analyzeFood.isPending || chatFood.isPending

  return (
    <div className="flex flex-col h-[calc(100svh-12rem)] overflow-hidden">
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
            Cuéntame qué has comido. Puedes escribirlo, hacerle una foto o dictarlo por voz.
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
                {m.kind === "thinking" && (
                  <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span className="text-base">Pensando...</span>
                  </div>
                )}
                {m.kind === "text" && (
                  <div className="rounded-2xl rounded-tl-sm bg-secondary px-3 py-2 text-base whitespace-pre-wrap">
                    {m.text}
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
                        {editingLogId ? "Revisa y ajusta antes de actualizar." : "Revisa y ajusta antes de guardar."}
                      </p>
                      <SourceBadges items={m.result.items} />
                      <ManualEntryForm
                        onSave={handleSave}
                        saving={saving}
                        initial={m.result}
                        isUpdate={!!editingLogId}
                      />
                      <RecipeSection result={m.result} />
                    </CardContent>
                  </Card>
                )}
                {m.kind === "saved" && m.mealName && (
                  <div className="rounded-2xl rounded-tl-sm bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                    {m.mealName} guardado correctamente.
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Favoritos */}
      {favorites.length > 0 && (
        <div className="pt-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Favoritos</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {favorites.map((f) => (
              <button
                key={f.name}
                type="button"
                onClick={() => quickLogFavorite(f)}
                className="shrink-0 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 min-h-[40px] text-sm font-medium flex items-center gap-1.5"
              >
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Composer — pinned at bottom via flex, never scrolls */}
      <div className="shrink-0 bg-background pt-2 pb-[env(safe-area-inset-bottom)]">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />
        <div className="flex items-end gap-2 rounded-2xl bg-secondary/50 p-2">
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
            placeholder="Cuéntame qué has comido..."
            rows={1}
            disabled={isAnalyzing}
            style={{ outline: "none" }}
            className="flex-1 resize-none bg-transparent text-base py-2 px-2 min-h-[48px] max-h-[140px] placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isAnalyzing}
            className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-secondary text-muted-foreground shrink-0"
            aria-label="Adjuntar foto"
          >
            <Camera className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            disabled={isAnalyzing}
            className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 ${
              isRecording ? "bg-destructive text-destructive-foreground" : "hover:bg-secondary text-muted-foreground"
            }`}
            aria-label={isRecording ? "Detener grabación" : "Grabar audio"}
          >
            {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={handleSendText}
            disabled={isAnalyzing || !textInput.trim()}
            className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shrink-0 disabled:opacity-40"
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
