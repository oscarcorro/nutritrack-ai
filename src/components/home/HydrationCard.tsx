import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { GlassWater, Minus, Plus, Droplet } from "lucide-react"

const GLASS_ML = 250

function madridDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

export function HydrationCard({ weightKg }: { weightKg: number | null | undefined }) {
  const today = useMemo(() => madridDateStr(new Date()), [])
  const storageKey = `nt:hydration:${today}`

  const peso = weightKg && weightKg > 0 ? weightKg : 70
  const targetMl = Math.round((peso * 35) / GLASS_ML) * GLASS_ML
  const targetGlasses = Math.max(1, Math.round(targetMl / GLASS_ML))

  const [ml, setMl] = useState<number>(0)
  const [animKey, setAnimKey] = useState<number>(0)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (raw) {
        const v = parseInt(raw, 10)
        if (!isNaN(v) && v >= 0) setMl(v)
      } else {
        setMl(0)
      }
    } catch {
      // ignore
    }
  }, [storageKey])

  const persist = (next: number) => {
    setMl(next)
    try {
      localStorage.setItem(storageKey, String(next))
    } catch {
      // ignore
    }
  }

  const handleAdd = () => {
    persist(ml + GLASS_ML)
    setAnimKey((k) => k + 1)
  }
  const handleSub = () => {
    persist(Math.max(0, ml - GLASS_ML))
  }

  const consumedGlasses = Math.floor(ml / GLASS_ML)
  const glasses = Array.from({ length: targetGlasses }, (_, i) => i < consumedGlasses)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Droplet className="h-4 w-4 text-blue-500" />
          Hidratación
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5" key={animKey}>
          {glasses.map((filled, i) => (
            <GlassWater
              key={i}
              className={`h-7 w-7 transition-all duration-500 ${
                filled ? "text-blue-500 fill-blue-200" : "text-muted-foreground/40"
              }`}
              style={filled ? { animation: "nt-fill-pop 500ms ease-out" } : undefined}
            />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-base font-semibold tabular-nums">
            {ml} <span className="text-muted-foreground font-normal">/ {targetMl} ml</span>
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSub}
              disabled={ml === 0}
              aria-label="Quitar un vaso"
              className="flex items-center justify-center w-12 h-12 rounded-full border border-border bg-secondary/60 hover:bg-secondary disabled:opacity-40"
            >
              <Minus className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={handleAdd}
              aria-label="Añadir un vaso"
              className="flex items-center justify-center w-12 h-12 rounded-full bg-blue-500 text-white hover:bg-blue-600"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
