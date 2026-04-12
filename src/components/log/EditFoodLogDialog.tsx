import { useEffect, useState, useRef } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Trash2, Mic, MicOff, Send } from "lucide-react"
import { toast } from "sonner"
import { useUpdateFoodLog, useDeleteFoodLog, useCreateFoodLog } from "@/hooks/use-food-log"
import { useAnalyzeFood } from "@/hooks/use-ai"
import { usePantry } from "@/hooks/use-pantry"
import type { FoodLog } from "@/integrations/supabase/types"

type Props = {
  log: FoodLog | null
  open: boolean
  onOpenChange: (v: boolean) => void
}

const num = (v: string) => {
  const n = parseFloat(v.replace(",", "."))
  return Number.isFinite(n) ? n : null
}

export function EditFoodLogDialog({ log, open, onOpenChange }: Props) {
  const updateLog = useUpdateFoodLog()
  const deleteLog = useDeleteFoodLog()
  const createLog = useCreateFoodLog()
  const analyzeFood = useAnalyzeFood()
  const { data: pantry } = usePantry()

  const [mealName, setMealName] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")
  const [fiber, setFiber] = useState("")
  const [scalePct, setScalePct] = useState("100")

  // AI modification input
  const [modText, setModText] = useState("")
  const [isModifying, setIsModifying] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioTranscriptRef = useRef("")

  useEffect(() => {
    if (!log) return
    setMealName(log.meal_name ?? "")
    setCalories(log.calories?.toString() ?? "")
    setProtein(log.protein_g?.toString() ?? "")
    setCarbs(log.carbs_g?.toString() ?? "")
    setFat(log.fat_g?.toString() ?? "")
    setFiber(log.fiber_g?.toString() ?? "")
    setScalePct("100")
    setModText("")
  }, [log])

  if (!log) return null

  const applyScale = () => {
    const pct = num(scalePct)
    if (pct == null || pct <= 0) { toast.error("Porcentaje invalido"); return }
    const factor = pct / 100
    const scale = (s: string) => { const n = num(s); return n == null ? "" : Math.round(n * factor * 10) / 10 + "" }
    setCalories(scale(calories))
    setProtein(scale(protein))
    setCarbs(scale(carbs))
    setFat(scale(fat))
    setFiber(scale(fiber))
    setScalePct("100")
    toast.success(`Escalado al ${pct}%`)
  }

  const applyAiModification = async (text: string) => {
    if (!text.trim()) return
    setIsModifying(true)
    try {
      const pantryItems = (pantry ?? []).map((p) => ({
        name: p.name,
        calories_per_100g: p.calories_per_100g ?? undefined,
        protein_g: p.protein_g_per_100g ?? undefined,
        carbs_g: p.carbs_g_per_100g ?? undefined,
        fat_g: p.fat_g_per_100g ?? undefined,
        fiber_g: p.fiber_g_per_100g ?? undefined,
      }))
      const context = `COMIDA ACTUAL A MODIFICAR: "${mealName}" con ${calories} kcal, P ${protein}g, C ${carbs}g, G ${fat}g, F ${fiber}g.\n\nMODIFICACION DEL USUARIO: ${text.trim()}\n\nRecalcula los NUEVOS TOTALES de la comida completa con la modificacion aplicada. Si el usuario añade algo, suma. Si reduce cantidad, resta proporcionalmente. Devuelve el JSON con los nuevos totales.`
      const result = await analyzeFood.mutateAsync({ text: context, pantry_items: pantryItems })
      setMealName(result.meal_name)
      setCalories(String(Math.round(result.calories)))
      setProtein(String(Math.round(result.protein_g)))
      setCarbs(String(Math.round(result.carbs_g)))
      setFat(String(Math.round(result.fat_g)))
      setFiber(result.fiber_g != null ? String(Math.round(result.fiber_g)) : "")
      setModText("")
      toast.success("Modificacion aplicada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al modificar")
    } finally {
      setIsModifying(false)
    }
  }

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error("Navegador no soporta voz"); return }
    audioTranscriptRef.current = ""
    const recognition = new SR()
    recognition.lang = "es-ES"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let t = ""
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      audioTranscriptRef.current = t
    }
    recognition.onerror = () => { toast.error("Error de voz"); setIsRecording(false) }
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
    const transcript = audioTranscriptRef.current.trim()
    if (!transcript) { toast.error("No se escucho nada"); return }
    setModText(transcript)
    applyAiModification(transcript)
  }

  const handleSave = async () => {
    try {
      await updateLog.mutateAsync({
        id: log.id,
        updates: {
          meal_name: mealName.trim() || log.meal_name,
          calories: num(calories),
          protein_g: num(protein),
          carbs_g: num(carbs),
          fat_g: num(fat),
          fiber_g: num(fiber),
        },
      })
      toast.success("Registro actualizado")
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar")
    }
  }

  const handleDelete = async () => {
    if (!confirm("¿Eliminar este registro?")) return
    const snapshot = log
    try {
      await deleteLog.mutateAsync(snapshot.id)
      toast.success("Registro eliminado", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              await createLog.mutateAsync({
                logged_at: snapshot.logged_at,
                meal_type: snapshot.meal_type,
                input_method: snapshot.input_method,
                raw_text: snapshot.raw_text,
                photo_url: snapshot.photo_url,
                audio_url: snapshot.audio_url,
                meal_name: snapshot.meal_name,
                description: snapshot.description,
                items: snapshot.items,
                calories: snapshot.calories,
                protein_g: snapshot.protein_g,
                carbs_g: snapshot.carbs_g,
                fat_g: snapshot.fat_g,
                fiber_g: snapshot.fiber_g,
                meal_plan_item_id: snapshot.meal_plan_item_id,
                ai_confidence: snapshot.ai_confidence,
                ai_model: snapshot.ai_model,
              })
              toast.success("Registro restaurado")
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "No se pudo restaurar")
            }
          },
        },
      })
      onOpenChange(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar")
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar registro</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={mealName} onChange={(e) => setMealName(e.target.value)} />
          </div>

          {/* AI modification */}
          <div className="rounded-lg border p-3 space-y-2 bg-secondary/40">
            <Label className="text-xs">Modificar con IA</Label>
            <p className="text-xs text-muted-foreground">
              Ej: "añade 30g de pan", "baja el arroz a 350g", "quita el aceite"
            </p>
            <div className="flex items-end gap-2">
              <input
                value={modText}
                onChange={(e) => setModText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyAiModification(modText) } }}
                placeholder="Describe el cambio..."
                disabled={isModifying}
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                type="button"
                onClick={isRecording ? stopRecording : startRecording}
                disabled={isModifying}
                className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${isRecording ? "bg-destructive text-destructive-foreground" : "hover:bg-secondary text-muted-foreground border border-border"}`}
                aria-label={isRecording ? "Parar" : "Dictar"}
              >
                {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => applyAiModification(modText)}
                disabled={isModifying || !modText.trim()}
                className="flex items-center justify-center w-10 h-10 rounded-full bg-primary text-primary-foreground shrink-0 disabled:opacity-40"
                aria-label="Aplicar"
              >
                {isModifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            {isRecording && (
              <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
                Escuchando...
              </p>
            )}
          </div>

          {/* Scale */}
          <div className="rounded-lg border p-3 space-y-2 bg-secondary/40">
            <Label className="text-xs">Ajuste rapido por porcentaje</Label>
            <p className="text-xs text-muted-foreground">Ej: comiste la mitad → 50</p>
            <div className="flex gap-2">
              <Input type="number" inputMode="decimal" value={scalePct} onChange={(e) => setScalePct(e.target.value)} placeholder="50" />
              <Button type="button" variant="outline" onClick={applyScale}>Aplicar</Button>
            </div>
          </div>

          {/* Manual fields */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Calorias (kcal)</Label>
              <Input type="number" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proteina (g)</Label>
              <Input type="number" inputMode="decimal" value={protein} onChange={(e) => setProtein(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Carbohidratos (g)</Label>
              <Input type="number" inputMode="decimal" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Grasa (g)</Label>
              <Input type="number" inputMode="decimal" value={fat} onChange={(e) => setFat(e.target.value)} />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Fibra (g)</Label>
              <Input type="number" inputMode="decimal" value={fiber} onChange={(e) => setFiber(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="outline" className="text-destructive border-destructive/30" onClick={handleDelete} disabled={deleteLog.isPending} aria-label="Eliminar">
            {deleteLog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button className="flex-1" onClick={handleSave} disabled={updateLog.isPending}>
            {updateLog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
