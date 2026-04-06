import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "sonner"
import { Camera, Plus, X, Loader2, Refrigerator } from "lucide-react"
import { compressImage } from "@/lib/image"
import {
  usePantry,
  useCreatePantryItem,
  useDeletePantryItem,
  useAnalyzePantryPhoto,
  type DetectedPantryItem,
} from "@/hooks/use-pantry"

export function PantrySection() {
  const { data: items, isLoading } = usePantry()
  const createItem = useCreatePantryItem()
  const deleteItem = useDeletePantryItem()
  const analyze = useAnalyzePantryPhoto()

  const fileRef = useRef<HTMLInputElement>(null)
  const [scanOpen, setScanOpen] = useState(false)
  const [detected, setDetected] = useState<DetectedPantryItem[]>([])
  const [selected, setSelected] = useState<Record<number, boolean>>({})
  const [adding, setAdding] = useState(false)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)

  // Manual add
  const [manualOpen, setManualOpen] = useState(false)
  const [manualName, setManualName] = useState("")
  const [manualQty, setManualQty] = useState("")

  // eslint: import is used via compressImage below

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    e.target.value = "" // allow re-selecting the same files
    if (!files.length) return

    // Dedupe helper (by lowercased name) as we accumulate across multiple photos
    const all: DetectedPantryItem[] = []
    const seen = new Set<string>()

    let done = 0
    setBatchProgress({ done: 0, total: files.length })
    toast.info(`Analizando ${files.length} foto${files.length > 1 ? "s" : ""}...`)

    // Process in parallel with a concurrency cap so we don't overwhelm the
    // edge function / Anthropic with 14 simultaneous requests. Retry each
    // photo up to 2 extra times on failure (rate limits / cold starts).
    const CONCURRENCY = 2
    const MAX_ATTEMPTS = 3
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

    const processOne = async (file: File, idx: number) => {
      let dataUrl: string
      try {
        dataUrl = await compressImage(file)
      } catch (err) {
        toast.error(`Foto ${idx + 1}: ${err instanceof Error ? err.message : "Error al leer"}`)
        done += 1
        setBatchProgress({ done, total: files.length })
        return
      }

      let lastErr: unknown = null
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
          const result = await analyze.mutateAsync({
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
          if (attempt < MAX_ATTEMPTS) {
            await sleep(500 * attempt) // 0.5s, 1s backoff
          }
        }
      }
      if (lastErr) {
        toast.error(
          `Foto ${idx + 1}: ${lastErr instanceof Error ? lastErr.message : "Error al analizar"}`
        )
      }
      done += 1
      setBatchProgress({ done, total: files.length })
    }

    // Simple worker-pool: pull next index from a shared counter
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
      toast.info("No se detectaron alimentos en las fotos")
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
          quantity_estimate: item.quantity_estimate || null,
          category: item.category || null,
          expires_at: null,
          source: "photo",
        })
      }
      toast.success(`${toAdd.length} alimentos añadidos`)
      setScanOpen(false)
      setDetected([])
      setSelected({})
    } catch {
      toast.error("Error al guardar")
    } finally {
      setAdding(false)
    }
  }

  const handleAddManual = async () => {
    if (!manualName.trim()) {
      toast.error("Indica el nombre")
      return
    }
    try {
      await createItem.mutateAsync({
        name: manualName,
        quantity_estimate: manualQty || null,
        category: null,
        expires_at: null,
        source: "manual",
      })
      toast.success("Añadido a la despensa")
      setManualName("")
      setManualQty("")
      setManualOpen(false)
    } catch {
      toast.error("Error al guardar")
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
            onClick={() => fileRef.current?.click()}
            disabled={analyze.isPending || !!batchProgress}
          >
            {batchProgress ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> {batchProgress.done}/{batchProgress.total}</>
            ) : analyze.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando...</>
            ) : (
              <><Camera className="h-4 w-4 mr-1" /> Escanear fotos</>
            )}
          </Button>
          <Button variant="outline" size="sm" className="flex-1" onClick={() => setManualOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Añadir
          </Button>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhoto} />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Cargando...</p>
        ) : items && items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <Badge key={item.id} variant="secondary" className="gap-1 py-1.5 px-3">
                <span>
                  {item.name}
                  {item.quantity_estimate && <span className="text-muted-foreground"> · {item.quantity_estimate}</span>}
                </span>
                <button onClick={() => handleDelete(item.id)} aria-label="Eliminar">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aun no hay alimentos. Escanea tu nevera o despensa para que los planes usen lo que tienes.
          </p>
        )}
      </CardContent>

      {/* Detected items dialog */}
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

      {/* Manual add dialog */}
      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir alimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ej: Kefir Pastoret" />
            </div>
            <div className="space-y-2">
              <Label>Cantidad (opcional)</Label>
              <Input value={manualQty} onChange={(e) => setManualQty(e.target.value)} placeholder="Ej: 500 g, 1 L" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddManual}>Añadir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
