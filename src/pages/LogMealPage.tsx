import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { useCreateFoodLog } from "@/hooks/use-food-log"
import { useAnalyzeFood, type AnalyzedFood } from "@/hooks/use-ai"
import { usePantry } from "@/hooks/use-pantry"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { MEAL_TYPE_LABELS } from "@/lib/nutrition"
import type { MealType } from "@/integrations/supabase/types"
import { Mic, Loader2, MicOff, Send, Star, Package, Sigma, ChefHat, ChevronDown, ChevronUp, Camera, RotateCcw } from "lucide-react"
import { compressImage, compressDataUrl } from "@/lib/image"
import { addRecipe, isRecipeSaved } from "@/lib/recipes"

/* ── Favorites ── */
const FAVS_KEY = "nt:favorites:v1"
const FAVS_MAX = 30
type Favorite = { name: string; kcal: number; p: number; c: number; g: number; fiber: number }

function loadFavorites(): Favorite[] {
  try {
    const raw = localStorage.getItem(FAVS_KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function saveFavorites(list: Favorite[]) {
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(list.slice(0, FAVS_MAX))) } catch {}
}
function isFavorited(list: Favorite[], name: string): boolean {
  return list.some((f) => f.name.trim().toLowerCase() === name.trim().toLowerCase())
}

function currentMealSlot(): MealType {
  try {
    const hh = parseInt(
      new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", hour: "2-digit", hour12: false }).format(new Date()), 10
    )
    if (hh < 10) return "breakfast"
    if (hh < 12) return "morning_snack"
    if (hh < 16) return "lunch"
    if (hh < 19) return "afternoon_snack"
    return "dinner"
  } catch { return "lunch" }
}

/* ── Source badges ── */
function SourceBadges({ items }: { items: AnalyzedFood["items"] }) {
  if (!items || items.length === 0) return null
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {items.map((it, idx) => {
        const isPantry = it.source === "pantry"
        return (
          <span key={idx} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${isPantry ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-secondary text-muted-foreground border border-border"}`}>
            {isPantry ? <Package className="h-3 w-3" /> : <Sigma className="h-3 w-3" />}
            <span className="truncate max-w-[120px]">{it.name}</span>
          </span>
        )
      })}
    </div>
  )
}

/* ── Recipe section ── */
function RecipeSection({ result }: { result: AnalyzedFood }) {
  const [open, setOpen] = useState(false)
  const [saved, setSaved] = useState(() => isRecipeSaved(result.meal_name))
  if (!result.recipe || (result.recipe.ingredients.length === 0 && result.recipe.steps.length === 0)) return null
  const handleSave = () => {
    if (saved) { toast.info("Ya guardada"); return }
    addRecipe({ name: result.meal_name, ingredients: result.recipe!.ingredients, steps: result.recipe!.steps, kcal: Math.round(result.calories) })
    setSaved(true)
    toast.success("Receta guardada")
  }
  return (
    <div className="mt-3 rounded-lg border border-border bg-secondary/30">
      <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold">
        <span className="flex items-center gap-2"><ChefHat className="h-4 w-4 text-primary" />Receta</span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-2 text-sm">
          {result.recipe.ingredients.length > 0 && (
            <div><p className="font-semibold mb-1">Ingredientes</p><ul className="list-disc list-inside space-y-0.5">{result.recipe.ingredients.map((i, idx) => <li key={idx}>{i}</li>)}</ul></div>
          )}
          {result.recipe.steps.length > 0 && (
            <div><p className="font-semibold mb-1">Pasos</p><ol className="list-decimal list-inside space-y-1">{result.recipe.steps.map((s, idx) => <li key={idx}>{s}</li>)}</ol></div>
          )}
          <Button type="button" variant={saved ? "secondary" : "outline"} size="sm" className="w-full" onClick={handleSave} disabled={saved}>
            <Star className={`h-4 w-4 mr-2 ${saved ? "fill-amber-500 text-amber-500" : ""}`} />
            {saved ? "Guardada" : "Guardar en mis recetas"}
          </Button>
        </div>
      )}
    </div>
  )
}

/* ── Main page ── */
export default function LogMealPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const createFoodLog = useCreateFoodLog()
  const analyzeFood = useAnalyzeFood()
  const { data: pantry } = usePantry()

  const [result, setResult] = useState<AnalyzedFood | null>(null)
  const [saving, setSaving] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [inputMethod, setInputMethod] = useState<"text" | "photo" | "audio">("text")
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)

  // Editable fields from analysis
  const [mealName, setMealName] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")
  const [fiber, setFiber] = useState("")
  const [mealType, setMealType] = useState<MealType>(currentMealSlot)

  // Input state
  const [textInput, setTextInput] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Audio
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioTranscriptRef = useRef("")

  // Favorites
  const [favorites, setFavorites] = useState<Favorite[]>(() => loadFavorites())
  useEffect(() => {
    const handler = () => setFavorites(loadFavorites())
    window.addEventListener("nt:favorites-changed", handler)
    window.addEventListener("storage", handler)
    return () => { window.removeEventListener("nt:favorites-changed", handler); window.removeEventListener("storage", handler) }
  }, [])

  // Auto-open method from navigation
  const handledMethodRef = useRef(false)
  useEffect(() => {
    if (handledMethodRef.current) return
    const method = (location.state as { method?: "photo" | "audio" | "text" } | null)?.method
    if (!method) return
    handledMethodRef.current = true
    if (method === "photo") setTimeout(() => fileInputRef.current?.click(), 100)
    else if (method === "audio") setTimeout(() => startRecording(), 100)
    else if (method === "text") setTimeout(() => textareaRef.current?.focus(), 100)
    navigate(location.pathname, { replace: true, state: null })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosize textarea
  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = "auto"
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px"
  }, [textInput])

  // Populate fields when result arrives
  useEffect(() => {
    if (!result) return
    setMealName(result.meal_name)
    setCalories(String(Math.round(result.calories)))
    setProtein(String(Math.round(result.protein_g)))
    setCarbs(String(Math.round(result.carbs_g)))
    setFat(String(Math.round(result.fat_g)))
    setFiber(result.fiber_g != null ? String(Math.round(result.fiber_g)) : "")
  }, [result])

  const pantryItems = (pantry ?? []).map((p) => ({
    name: p.name,
    calories_per_100g: p.calories_per_100g ?? undefined,
    protein_g: p.protein_g_per_100g ?? undefined,
    carbs_g: p.carbs_g_per_100g ?? undefined,
    fat_g: p.fat_g_per_100g ?? undefined,
    fiber_g: p.fiber_g_per_100g ?? undefined,
  }))

  const runAnalyze = async (input: { text?: string; transcript?: string; image_base64?: string; media_type?: string }) => {
    setIsAnalyzing(true)
    try {
      const res = await analyzeFood.mutateAsync({ ...input, pantry_items: pantryItems })
      setResult(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al analizar")
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleSendText = async () => {
    const text = textInput.trim()
    if (!text) return
    setInputMethod("text")
    await runAnalyze({ text })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      setPhotoPreview(dataUrl)
      setInputMethod("photo")
      const compressed = await compressDataUrl(dataUrl)
      await runAnalyze({ image_base64: compressed, media_type: "image/jpeg" })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer foto")
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error("Tu navegador no soporta reconocimiento de voz"); return }
    audioTranscriptRef.current = ""
    const recognition = new SR()
    recognition.lang = "es-ES"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let text = ""
      for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript
      audioTranscriptRef.current = text
    }
    recognition.onerror = () => { toast.error("Error en reconocimiento de voz"); setIsRecording(false) }
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  const stopRecording = async () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
    const transcript = audioTranscriptRef.current.trim()
    if (!transcript) { toast.error("No se pudo escuchar nada"); return }
    setTextInput(transcript)
    setInputMethod("audio")
    await runAnalyze({ transcript })
  }

  const handleConfirm = async () => {
    if (!mealName.trim()) { toast.error("Escribe el nombre"); return }
    if (!calories) { toast.error("Indica las calorías"); return }
    setSaving(true)
    try {
      await createFoodLog.mutateAsync({
        logged_at: new Date().toISOString(),
        meal_type: mealType,
        input_method: inputMethod,
        raw_text: textInput || null,
        photo_url: null,
        audio_url: null,
        meal_name: mealName.trim(),
        description: null,
        items: (result?.items ?? []) as unknown as [],
        calories: parseFloat(calories),
        protein_g: parseFloat(protein) || 0,
        carbs_g: parseFloat(carbs) || 0,
        fat_g: parseFloat(fat) || 0,
        fiber_g: parseFloat(fiber) || null,
        meal_plan_item_id: null,
        ai_confidence: result?.confidence ?? null,
        ai_model: result?.model ?? null,
      })
      toast.success("Comida registrada")
      // Reset for next entry
      setResult(null)
      setTextInput("")
      setPhotoPreview(null)
      setMealName("")
      setCalories("")
      setProtein("")
      setCarbs("")
      setFat("")
      setFiber("")
      setMealType(currentMealSlot())
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setTextInput("")
    setPhotoPreview(null)
    setMealName("")
    setCalories("")
    setProtein("")
    setCarbs("")
    setFat("")
    setFiber("")
  }

  const quickLogFavorite = async (fav: Favorite) => {
    try {
      await createFoodLog.mutateAsync({
        logged_at: new Date().toISOString(),
        meal_type: currentMealSlot(),
        input_method: "text",
        raw_text: fav.name,
        photo_url: null, audio_url: null,
        meal_name: fav.name, description: null, items: [],
        calories: fav.kcal, protein_g: fav.p, carbs_g: fav.c, fat_g: fav.g,
        fiber_g: fav.fiber || null,
        meal_plan_item_id: null, ai_confidence: null, ai_model: null,
      })
      toast.success("Registrado")
    } catch { toast.error("Error al guardar") }
  }

  // Favorite toggle
  const [favs, setFavs] = useState<Favorite[]>(() => loadFavorites())
  const fav = mealName ? isFavorited(favs, mealName) : false
  const toggleFav = () => {
    const name = mealName.trim()
    if (!name) { toast.error("Escribe el nombre primero"); return }
    const k = name.toLowerCase()
    let next: Favorite[]
    if (favs.some((f) => f.name.trim().toLowerCase() === k)) {
      next = favs.filter((f) => f.name.trim().toLowerCase() !== k)
      toast.success("Quitado de favoritos")
    } else {
      const entry: Favorite = { name, kcal: parseFloat(calories) || 0, p: parseFloat(protein) || 0, c: parseFloat(carbs) || 0, g: parseFloat(fat) || 0, fiber: parseFloat(fiber) || 0 }
      next = [entry, ...favs.filter((f) => f.name.trim().toLowerCase() !== k)].slice(0, FAVS_MAX)
      toast.success("Favorito guardado")
    }
    setFavs(next)
    saveFavorites(next)
    window.dispatchEvent(new Event("nt:favorites-changed"))
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Registrar comida</h2>

      {/* Input area */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />

          {photoPreview && (
            <img src={photoPreview} alt="Foto" className="rounded-xl max-h-48 mx-auto" />
          )}

          <div className="flex items-end gap-2 rounded-2xl bg-secondary/50 p-2">
            <textarea
              ref={textareaRef}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendText() } }}
              placeholder="Describe tu comida..."
              rows={1}
              disabled={isAnalyzing}
              style={{ outline: "none", boxShadow: "none" }}
              className="flex-1 resize-none bg-transparent text-base py-2 px-2 min-h-[48px] max-h-[120px] placeholder:text-muted-foreground [&:focus-visible]:ring-0 [&:focus-visible]:ring-offset-0 [&:focus-visible]:outline-none"
            />
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isAnalyzing} className="flex items-center justify-center w-12 h-12 rounded-full hover:bg-secondary text-muted-foreground shrink-0" aria-label="Foto">
              <Camera className="h-5 w-5" />
            </button>
            <button type="button" onClick={isRecording ? stopRecording : startRecording} disabled={isAnalyzing} className={`flex items-center justify-center w-12 h-12 rounded-full shrink-0 ${isRecording ? "bg-destructive text-destructive-foreground" : "hover:bg-secondary text-muted-foreground"}`} aria-label={isRecording ? "Parar" : "Grabar"}>
              {isRecording ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
            </button>
            <button type="button" onClick={handleSendText} disabled={isAnalyzing || !textInput.trim()} className="flex items-center justify-center w-12 h-12 rounded-full bg-primary text-primary-foreground shrink-0 disabled:opacity-40" aria-label="Analizar">
              {isAnalyzing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
            </button>
          </div>

          {isRecording && (
            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
              Escuchando... toca el micro para parar.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Analyzing skeleton */}
      {isAnalyzing && (
        <Card className="animate-pulse">
          <CardContent className="p-4 space-y-3">
            <div className="h-5 w-2/3 rounded bg-secondary" />
            <div className="grid grid-cols-5 gap-2">
              {[...Array(5)].map((_, i) => <div key={i} className="h-10 rounded bg-secondary" />)}
            </div>
            <div className="h-10 rounded bg-secondary" />
          </CardContent>
        </Card>
      )}

      {/* Result card */}
      {result && !isAnalyzing && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Resultado del analisis</p>
              <button type="button" onClick={handleReset} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <RotateCcw className="h-3 w-3" /> Limpiar
              </button>
            </div>

            <SourceBadges items={result.items} />

            <div className="space-y-1.5">
              <Label htmlFor="meal-name">Nombre</Label>
              <Input id="meal-name" value={mealName} onChange={(e) => setMealName(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de comida</Label>
              <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(MEAL_TYPE_LABELS) as [MealType, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-5 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">kcal</Label>
                <Input type="number" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} className="text-center px-1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Prot</Label>
                <Input type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} className="text-center px-1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Carbs</Label>
                <Input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} className="text-center px-1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Grasa</Label>
                <Input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} className="text-center px-1" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fibra</Label>
                <Input type="number" inputMode="decimal" value={fiber} onChange={(e) => setFiber(e.target.value)} className="text-center px-1" />
              </div>
            </div>

            <RecipeSection result={result} />

            <div className="flex gap-2 pt-1">
              <Button onClick={handleConfirm} className="flex-1" size="lg" disabled={saving}>
                {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Confirmar"}
              </Button>
              <button type="button" onClick={toggleFav} aria-label={fav ? "Quitar favorito" : "Favorito"} className={`flex items-center justify-center w-12 h-12 rounded-md border ${fav ? "bg-amber-100 border-amber-300 text-amber-600" : "border-border bg-secondary/60 text-muted-foreground"}`}>
                <Star className={`h-5 w-5 ${fav ? "fill-amber-500" : ""}`} />
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Favorites */}
      {favorites.length > 0 && !result && (
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Favoritos</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {favorites.map((f) => (
              <button key={f.name} type="button" onClick={() => quickLogFavorite(f)} className="shrink-0 rounded-full border border-amber-300 bg-amber-50 hover:bg-amber-100 px-3 min-h-[40px] text-sm font-medium flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" />{f.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
