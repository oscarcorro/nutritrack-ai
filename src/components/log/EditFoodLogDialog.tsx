import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useUpdateFoodLog, useDeleteFoodLog } from "@/hooks/use-food-log"
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

  const [mealName, setMealName] = useState("")
  const [calories, setCalories] = useState("")
  const [protein, setProtein] = useState("")
  const [carbs, setCarbs] = useState("")
  const [fat, setFat] = useState("")
  const [fiber, setFiber] = useState("")
  const [scalePct, setScalePct] = useState("100")

  useEffect(() => {
    if (!log) return
    setMealName(log.meal_name ?? "")
    setCalories(log.calories?.toString() ?? "")
    setProtein(log.protein_g?.toString() ?? "")
    setCarbs(log.carbs_g?.toString() ?? "")
    setFat(log.fat_g?.toString() ?? "")
    setFiber(log.fiber_g?.toString() ?? "")
    setScalePct("100")
  }, [log])

  if (!log) return null

  const applyScale = () => {
    const pct = num(scalePct)
    if (pct == null || pct <= 0) {
      toast.error("Porcentaje invalido")
      return
    }
    const factor = pct / 100
    const scale = (s: string) => {
      const n = num(s)
      return n == null ? "" : Math.round(n * factor * 10) / 10 + ""
    }
    setCalories(scale(calories))
    setProtein(scale(protein))
    setCarbs(scale(carbs))
    setFat(scale(fat))
    setFiber(scale(fiber))
    setScalePct("100")
    toast.success(`Escalado al ${pct}%`)
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
    try {
      await deleteLog.mutateAsync(log.id)
      toast.success("Registro eliminado")
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

          <div className="rounded-lg border p-3 space-y-2 bg-secondary/40">
            <Label className="text-xs">Ajuste rápido por porcentaje</Label>
            <p className="text-xs text-muted-foreground">
              Ej: comiste la mitad → 50. Escala todos los macros proporcionalmente.
            </p>
            <div className="flex gap-2">
              <Input
                type="number"
                inputMode="decimal"
                value={scalePct}
                onChange={(e) => setScalePct(e.target.value)}
                placeholder="50"
              />
              <Button type="button" variant="outline" onClick={applyScale}>
                Aplicar
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Calorías (kcal)</Label>
              <Input type="number" inputMode="decimal" value={calories} onChange={(e) => setCalories(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Proteína (g)</Label>
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
          <Button
            variant="outline"
            className="text-destructive border-destructive/30"
            onClick={handleDelete}
            disabled={deleteLog.isPending}
          >
            {deleteLog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="flex-1" onClick={handleSave} disabled={updateLog.isPending}>
            {updateLog.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
