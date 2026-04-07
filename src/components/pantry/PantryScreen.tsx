import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Camera, Plus, Loader2, Refrigerator, X } from "lucide-react"
import { toast } from "sonner"
import { compressImage } from "@/lib/image"
import { supabase } from "@/integrations/supabase/client"

const STORAGE_KEY = "nt:pantry:v1"

export interface PantryChip {
  name: string
  qty?: string
}

export function loadPantry(): PantryChip[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((x) => x && typeof x.name === "string")
  } catch {
    return []
  }
}

export function savePantry(items: PantryChip[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function getPantryNames(): string[] {
  return loadPantry().map((p) => (p.qty ? `${p.name} (${p.qty})` : p.name))
}

interface AnalyzePantryResponse {
  items?: Array<{ name?: string; quantity_estimate?: string }>
}

export function PantryScreen({ onClose }: { onClose?: () => void }) {
  const [items, setItems] = useState<PantryChip[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [newName, setNewName] = useState("")
  const [newQty, setNewQty] = useState("")
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setItems(loadPantry())
  }, [])

  const persist = (next: PantryChip[]) => {
    setItems(next)
    savePantry(next)
  }

  const handleRemove = (idx: number) => {
    persist(items.filter((_, i) => i !== idx))
  }

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    persist([...items, { name, qty: newQty.trim() || undefined }])
    setNewName("")
    setNewQty("")
  }

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setAnalyzing(true)
    try {
      const dataUrl = await compressImage(file)
      const { data, error } = await supabase.functions.invoke("ai-analyze-pantry", {
        body: { image_base64: dataUrl, media_type: "image/jpeg" },
      })
      if (error) throw new Error(error.message || "Error al analizar")
      const resp = (data || {}) as AnalyzePantryResponse
      const detected: PantryChip[] = (resp.items || [])
        .filter((it) => it && typeof it.name === "string" && it.name.trim())
        .map((it) => ({ name: it.name!.trim(), qty: it.quantity_estimate?.trim() || undefined }))
      if (!detected.length) {
        toast.info("No se detectaron alimentos")
        return
      }
      const seen = new Set(items.map((i) => i.name.toLowerCase()))
      const merged = [...items]
      for (const d of detected) {
        if (!seen.has(d.name.toLowerCase())) {
          merged.push(d)
          seen.add(d.name.toLowerCase())
        }
      }
      persist(merged)
      toast.success(`${detected.length} alimentos detectados`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al analizar")
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Refrigerator className="h-5 w-5" /> Despensa
          </span>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Lo que tengas aquí se tendrá en cuenta al generar tu plan.
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={() => fileRef.current?.click()}
            disabled={analyzing}
          >
            {analyzing ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Analizando...</>
            ) : (
              <><Camera className="h-4 w-4 mr-1" /> Foto de despensa</>
            )}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhoto}
          />
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Nombre (ej: tomate)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
          />
          <Input
            placeholder="Cant."
            value={newQty}
            onChange={(e) => setNewQty(e.target.value)}
            className="w-24"
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
          />
          <Button size="sm" onClick={handleAdd}>
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {items.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {items.map((it, i) => (
              <span
                key={`${it.name}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
              >
                <span>{it.name}{it.qty ? ` · ${it.qty}` : ""}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(i)}
                  aria-label={`Quitar ${it.name}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aún no hay alimentos. Añade manualmente o usa una foto.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
