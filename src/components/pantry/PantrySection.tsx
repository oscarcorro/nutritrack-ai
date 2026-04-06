import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Camera, Plus, Trash2, Loader2, Refrigerator, Pencil, ScanLine, CheckCircle2 } from "lucide-react"
import { compressImage } from "@/lib/image"
import {
  usePantry,
  useCreatePantryItem,
  useUpdatePantryItem,
  useDeletePantryItem,
  useAnalyzePantryPhoto,
  useAnalyzeNutritionLabel,
  type DetectedPantryItem,
} from "@/hooks/use-pantry"
import type { PantryItem } from "@/integrations/supabase/types"

type EditState = {
  id: string | null // null = new item
  name: string
  brand: string
  quantity_estimate: string
  serving_unit: string
  calories_per_100g: string
  protein_g_per_100g: string
  carbs_g_per_100g: string
  fat_g_per_100g: string
  fiber_g_per_100g: string
}

const EMPTY_EDIT: EditState = {
  id: null,
  name: "",
  brand: "",
  quantity_estimate: "",
  serving_unit: "g",
  calories_per_100g: "",
  protein_g_per_100g: "",
  carbs_g_per_100g: "",
  fat_g_per_100g: "",
  fiber_g_per_100g: "",
}

function hasNutrition(item: PantryItem): boolean {
  return item.calories_per_100g != null
}

export function PantrySection() {
  const { data: items, isLoading } = usePantry()
  const createItem = useCreatePantryItem()
  const updateItem = useUpdatePantryItem()
  const deleteItem = useDeletePantryItem()
  const analyzePantry = useAnalyzePantryPhoto()
  const analyzeLabel = useAnalyzeNutritionLabel()

  const bulkFileRef = useRef<HTMLInputElement>(null)
  const labelFileRef = useRef<HTMLInputElement>(null)

  // Bulk scan state
  const [scanOpen, setScanOpen] = useState(false)
  const [detected, setDetected] = useState<DetectedPantryItem[]>([])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  // Edit/create dialog
  const [editOpen, setEditOpen] = useState(false)
  const [edit, setEdit] = useState<EditState>(EMPTY_EDIT)
  const [saving, setSaving] = useState(false)

  const openNew = () => {
    setEdit(EMPTY_EDIT)
    setEditOpen(true)
  }

  const openEdit = (item: PantryItem) => {
    setEdit({
      id: item.id,
      name: item.name,
      brand: item.brand ?? "",
      quantity_estimate: item.quantity_estimate ?? "",
      serving_unit: item.serving_unit ?? "g",
      calories_per_100g: item.calories_per_100g?.toString() ?? "",
      protein_g_per_100g: item.protein_g_per_100g?.toString() ?? "",
      carbs_g_per_100g: item.carbs_g_per_100g?.toString() ?? "",
      fat_g_per_100g: item.fat_g_per_100g?.toString() ?? "",
      fiber_g_per_100g: item.fiber_g_per_100g?.toString() ?? "",
    })
    setEditOpen(true)
  }

  const parseNumOrNull = (s: string) => {
    const n = parseFloat(s.replace(",", "."))
    return Number.isFinite(n) ? n : null
  }

  const handleSaveEdit = async () => {
    if (!edit.name.trim()) {
      toast.error("Indica el nombre")
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: edit.name.trim(),
        brand: edit.brand.trim() || null,
        quantity_estimate: edit.quantity_estimate.trim() || null,
        serving_unit: edit.serving_unit || null,
        calories_per_100g: parseNumOrNull(edit.calories_per_100g),
        protein_g_per_100g: parseNumOrNull(edit.protein_g_per_100g),
        carbs_g_per_100g: parseNumOrNull(edit.carbs_g_per_100g),
        fat_g_per_100g: parseNumOrNull(edit.fat_g_per_100g),
        fiber_g_per_100g: parseNumOrNull(edit.fiber_g_per_100g),
      }
      if (edit.id) {
        await updateItem.mutateAsync({ id: edit.id, updates: payload })
        toast.success("Actualizado")
      } else {
        await createItem.mutateAsync({
          ...payload,
          category: null,
          expires_at: null,
          source: "manual",
          notes: null,
        })
        toast.success("Añadido a la despensa")
      }
      setEditOpen(false)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  // Scan nutrition label — fills the edit form with results
  const handleScanLabel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    try {
      const dataUrl = await compressImage(file)
      const result = await analyzeLabel.mutateAsync({
        image_base64: dataUrl,
        media_type: "image/jpeg",
        product_hint: edit.name || undefined,
      })
      setEdit((s) => ({
        ...s,
        name: s.name || result.name || "",
        brand: s.brand || result.brand || "",
        serving_unit: result.serving_unit || s.serving_unit,
        calories_per_100g: result.calories_per_100g?.toString() ?? s.calories_per_100g,
        protein_g_per_100g: result.protein_g_per_100g?.toString() ?? s.protein_g_per_100g,
        carbs_g_per_100g: result.carbs_g_per_100g?.toString() ?? s.carbs_g_per_100g,
        fat_g_per_100g: result.fat_g_per_100g?.toString() ?? s.fat_g_per_100g,
        fiber_g_per_100g: result.fiber_g_per_100g?.toString() ?? s.fiber_g_per_100g,
      }))
      toast.success("Etiqueta leida")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al leer etiqueta")
    }
  }

  // Bulk scan of fridge/pantry photos
  const handleBulkPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ""
    if (!files.length) return

    const all: DetectedPantryItem[] = []
    const seen = new Set<string>()
    let done = 0
    setBatchProgress({ done: 0, total: files.length })
    toast.info(`Analizando ${files.length} foto${files.length > 1 ? "s" : ""}...`)

    const CONCURRENCY = 2
    const MAX_ATTEMPTS = 3
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const processOne = async (file: File, idx: number) => {
      let dataUrl: string
      try {
        dataUrl = await compressImage(file)
      } catch (err) {
        toast.error(`Foto ${idx + 1}: ${err instanceof Error ? err.message : "Error"}`)
        done += 1
        setBatchProgress({ done, total: files.length })
        return
      }
      let lastErr: unknown = null
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const result = await analyzePantry.mutateAsync({
            image_base64: dataUrl,
            media_type: "image/jpeg",
          })
          for (const item of result.items || []) {
            const key = item.name.trim().toLowerCase()
            if (key && !seen.has(key)) {
              seen.add(key)
              all.push(item)
            }
          }
          lastErr = null
          break
        } catch (err) {
          lastErr = err
          if (attempt < MAX_ATTEMPTS) await sleep(500 * attempt)
        }
      }
      if (lastErr) {
        toast.error(
          `Foto ${idx + 1}: ${lastErr instanceof Error ? lastErr.message : "Error"}`
        )
      }
      done += 1
      setBatchProgress({ done, total: files.length })
    }

    let next = 0
    const worker = async () => {
      while (true) {
        const i = next++
        if (i >= files.length) return
        await processOne(files[i], i)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, files.length) }, () => worker())
    )

    setBatchProgress(null)

    if (!all.length) {
      toast.info("No se detectaron alimentos")
      return
    }

    setDetected(all)
    const sel: Record<number, boolean> = {}
    all.forEach((_, i) => (sel[i] = true))
    setSelected(sel)
    setScanOpen(true)
  }

  const handleConfirmDetected = async () => {
    setAdding(true)
    try {
      const toAdd = detected.filter((_, i) => selected[i])
      for (const item of toAdd) {
        await createItem.mutateAsync({
          name: item.name,
          brand: null,
          quantity_estimate: item.quantity_estimate || null,
          category: item.category || null,
          expires_at: null,
          source: "photo",
          calories_per_100g: null,
          protein_g_per_100g: null,
          carbs_g_per_100g: null,
          fat_g_per_100g: null,
          fiber_g_per_100g: null,
          serving_unit: null,
          notes: null,
        })
      }
      toast.success(`${toAdd.length} alimentos añadidos. Ábrelos para añadir macros exactos.`)
      setScanOpen(false)
      setDetected([])
      setSelected({})
    } catch {
      toast.error("Error al guardar")
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await deleteItem.mutateAsync(id)
    } catch {
      toast.error("Error al eliminar")
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Refrigerator className="h-5 w-5" /> Mi despensa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => bulkFileRef.current?.click()}
            disabled={analyzePantry.isPending || !!batchProgress}
          >
            {batchProgress ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {batchProgress.done}/{batchProgress.total}</>
            ) : (
              <><Camera className="h-4 w-4 mr-1" /> Escanear fotos</>
            )}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={openNew}>
            <Plus className="h-4 w-4 mr-1" /> Añadir
          </Button>
          <input
            ref={bulkFileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleBulkPhoto}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Toca un alimento para añadir sus macros por 100g (desde foto de la etiqueta o a mano). Asi el contador de calorias es preciso cuando lo comas.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : items && items.length > 0 ? (
          <div className="divide-y rounded-lg border">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-2 p-3">
                <button
                  onClick={() => openEdit(item)}
                  className="flex-1 text-left min-w-0"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">
                      {item.name}
                      {item.brand && <span className="text-muted-foreground font-normal"> · {item.brand}</span>}
                    </p>
                    {hasNutrition(item) && (
                      <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-label="Macros definidas" />
                    )}
                  </div>
                  {hasNutrition(item) ? (
                    <p className="text-xs text-muted-foreground">
                      {item.calories_per_100g} kcal · P {item.protein_g_per_100g ?? 0}g · C {item.carbs_g_per_100g ?? 0}g · G {item.fat_g_per_100g ?? 0}g / 100{item.serving_unit || "g"}
                    </p>
                  ) : (
                    <p className="text-xs text-amber-700">Sin macros — toca para añadir</p>
                  )}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(item)}
                  aria-label="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(item.id)}
                  aria-label="Eliminar"
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aun no hay alimentos. Escanea tu despensa o añade uno para que los planes y el registro sean mas precisos.
          </p>
        )}
      </CardContent>

      {/* Bulk detected items dialog */}
      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Alimentos detectados</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            {detected.map((item, i) => (
              <label key={i} className="flex items-start gap-3 p-2 rounded-lg hover:bg-secondary cursor-pointer">
                <Checkbox
                  checked={!!selected[i]}
                  onCheckedChange={(v) => setSelected((s) => ({ ...s, [i]: !!v }))}
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.quantity_estimate}{item.category ? ` · ${item.category}` : ""}
                  </p>
                </div>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanOpen(false)}>Cancelar</Button>
            <Button onClick={handleConfirmDetected} disabled={adding}>
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Añadir seleccionados"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create / edit item dialog with nutrition */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit.id ? "Editar alimento" : "Añadir alimento"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => labelFileRef.current?.click()}
              disabled={analyzeLabel.isPending}
            >
              {analyzeLabel.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Leyendo etiqueta...</>
              ) : (
                <><ScanLine className="h-4 w-4 mr-2" /> Escanear etiqueta nutricional</>
              )}
            </Button>
            <input
              ref={labelFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleScanLabel}
            />

            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={edit.name}
                  onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                  placeholder="Yogur griego natural"
                />
              </div>
              <div className="space-y-1">
                <Label>Marca</Label>
                <Input
                  value={edit.brand}
                  onChange={(e) => setEdit((s) => ({ ...s, brand: e.target.value }))}
                  placeholder="Pastoret"
                />
              </div>
              <div className="space-y-1">
                <Label>Cantidad</Label>
                <Input
                  value={edit.quantity_estimate}
                  onChange={(e) => setEdit((s) => ({ ...s, quantity_estimate: e.target.value }))}
                  placeholder="500 g"
                />
              </div>
            </div>

            <div className="pt-2">
              <p className="text-sm font-semibold mb-2">Valores por 100 {edit.serving_unit || "g"}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Calorias (kcal)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={edit.calories_per_100g}
                    onChange={(e) => setEdit((s) => ({ ...s, calories_per_100g: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Unidad</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={edit.serving_unit}
                    onChange={(e) => setEdit((s) => ({ ...s, serving_unit: e.target.value }))}
                  >
                    <option value="g">g (solido)</option>
                    <option value="ml">ml (liquido)</option>
                    <option value="unit">unidad</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Proteina (g)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={edit.protein_g_per_100g}
                    onChange={(e) => setEdit((s) => ({ ...s, protein_g_per_100g: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Carbohidratos (g)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={edit.carbs_g_per_100g}
                    onChange={(e) => setEdit((s) => ({ ...s, carbs_g_per_100g: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Grasa (g)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={edit.fat_g_per_100g}
                    onChange={(e) => setEdit((s) => ({ ...s, fat_g_per_100g: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fibra (g)</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={edit.fiber_g_per_100g}
                    onChange={(e) => setEdit((s) => ({ ...s, fiber_g_per_100g: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
