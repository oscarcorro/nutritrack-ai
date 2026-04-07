import { useState, useMemo, useRef, useEffect } from "react"
import { compressImage } from "@/lib/image"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Camera, Images } from "lucide-react"
import { useWeightLog, useCreateWeightLog } from "@/hooks/use-weight-log"
import { useFoodLog } from "@/hooks/use-food-log"
import { useCurrentGoal } from "@/hooks/use-goals"
import { useProfile } from "@/hooks/use-profile"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { calculateBMI, getBMICategory, formatCalories } from "@/lib/nutrition"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from "recharts"
import { Loader2, TrendingDown, Target, Activity, Flame, Download } from "lucide-react"
import { format, subDays } from "date-fns"
import { es } from "date-fns/locale"

// Madrid-timezone YYYY-MM-DD for a given Date
const madridDateStr = (d: Date): string => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
  return parts // en-CA gives YYYY-MM-DD
}
const madridShort = (d: Date): string =>
  new Intl.DateTimeFormat("es-ES", { timeZone: "Europe/Madrid", day: "2-digit", month: "2-digit" }).format(d)

export default function ProgressPage() {
  const { data: weightLogs, isLoading: weightLoading } = useWeightLog(30)
  const { data: weightLogs90 } = useWeightLog(90)
  const { data: goal } = useCurrentGoal()
  const { data: profile } = useProfile()
  const createWeight = useCreateWeightLog()

  const [newWeight, setNewWeight] = useState("")
  const [savingWeight, setSavingWeight] = useState(false)

  // Progress photos
  type ProgressPhoto = { date: string; dataUrl: string }
  const PHOTOS_KEY = "nt:progress-photos:v1"
  const PHOTOS_MAX = 12
  const [photos, setPhotos] = useState<ProgressPhoto[]>([])
  const photoInputRef = useRef<HTMLInputElement>(null)
  const [viewerPhoto, setViewerPhoto] = useState<ProgressPhoto | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  const [compareSelection, setCompareSelection] = useState<number[]>([])
  const [comparePair, setComparePair] = useState<[ProgressPhoto, ProgressPhoto] | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PHOTOS_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) setPhotos(arr)
      }
    } catch {
      // ignore
    }
  }, [])

  const persistPhotos = (list: ProgressPhoto[]) => {
    setPhotos(list)
    try {
      localStorage.setItem(PHOTOS_KEY, JSON.stringify(list))
    } catch {
      toast.error("No se pudo guardar la foto (almacenamiento lleno)")
    }
  }

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPhoto(true)
    try {
      const dataUrl = await compressImage(file, { maxDimension: 900, jpegQuality: 0.7, webpQuality: 0.65 })
      const today = madridDateStr(new Date())
      const next: ProgressPhoto[] = [...photos, { date: today, dataUrl }]
      while (next.length > PHOTOS_MAX) next.shift()
      persistPhotos(next)
      toast.success("Foto guardada")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar foto")
    } finally {
      setUploadingPhoto(false)
      if (photoInputRef.current) photoInputRef.current.value = ""
    }
  }

  const togglePhotoSelection = (idx: number) => {
    setCompareSelection((prev) => {
      if (prev.includes(idx)) return prev.filter((i) => i !== idx)
      if (prev.length >= 2) return [prev[1], idx]
      const next = [...prev, idx]
      if (next.length === 2) {
        setComparePair([photos[next[0]], photos[next[1]]])
      }
      return next
    })
  }

  // Fetch last 7 days food log
  const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd")
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const { data: foodLogs } = useFoodLog(`${sevenDaysAgo}T00:00:00`, `${todayStr}T23:59:59`)

  // Fetch 90 days food log for export
  const ninetyDaysAgo = format(subDays(new Date(), 89), "yyyy-MM-dd")
  const { data: foodLogs90 } = useFoodLog(`${ninetyDaysAgo}T00:00:00`, `${todayStr}T23:59:59`)

  // Weight chart data with 7-day moving average
  const weightChartData = useMemo(() => {
    if (!weightLogs) return []
    return weightLogs.map((log, idx) => {
      const window = weightLogs.slice(Math.max(0, idx - 6), idx + 1)
      const avg = window.reduce((s, l) => s + l.weight_kg, 0) / window.length
      return {
        date: madridShort(new Date(log.measured_at)),
        peso: log.weight_kg,
        media: Math.round(avg * 10) / 10,
      }
    })
  }, [weightLogs])

  // Calorie chart data
  const calorieChartData = useMemo(() => {
    if (!foodLogs) return []
    const byDate: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd")
      byDate[d] = 0
    }
    foodLogs.forEach((log) => {
      const d = log.logged_at.split("T")[0]
      if (byDate[d] !== undefined) {
        byDate[d] += log.calories || 0
      }
    })
    return Object.entries(byDate).map(([date, cal]) => ({
      date: format(new Date(date), "EEE", { locale: es }),
      calorias: Math.round(cal),
    }))
  }, [foodLogs])

  const currentWeight = weightLogs?.length ? weightLogs[weightLogs.length - 1].weight_kg : profile?.weight_kg || 0
  const bmi = currentWeight && profile?.height_cm ? calculateBMI(currentWeight, profile.height_cm) : 0

  // Streak: consecutive days with at least one food_log entry up to today (Madrid)
  const streak = useMemo(() => {
    const source = foodLogs90 || foodLogs
    if (!source) return 0
    const daysWithLog = new Set<string>()
    source.forEach((l) => {
      daysWithLog.add(madridDateStr(new Date(l.logged_at)))
    })
    let count = 0
    for (let i = 0; i < 365; i++) {
      const d = madridDateStr(subDays(new Date(), i))
      if (daysWithLog.has(d)) {
        count++
      } else if (i === 0) {
        // allow today to be missing without breaking streak
        continue
      } else {
        break
      }
    }
    return count
  }, [foodLogs, foodLogs90])

  // Adherencia semanal: % de últimos 7 días con kcal dentro de ±10% del objetivo
  const adherencia = useMemo(() => {
    if (!foodLogs || !goal?.daily_calories_target) return { days: 0, pct: 0 }
    const target = goal.daily_calories_target
    const min = target * 0.9
    const max = target * 1.1
    const byDate: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      byDate[madridDateStr(subDays(new Date(), i))] = 0
    }
    foodLogs.forEach((l) => {
      const d = madridDateStr(new Date(l.logged_at))
      if (byDate[d] !== undefined) byDate[d] += l.calories || 0
    })
    const days = Object.values(byDate).filter((kcal) => kcal >= min && kcal <= max).length
    return { days, pct: Math.round((days / 7) * 100) }
  }, [foodLogs, goal?.daily_calories_target])

  const handleExportCSV = () => {
    const rows: string[] = ["tipo,fecha,valor,unidad,detalle"]
    ;(weightLogs90 || []).forEach((w) => {
      rows.push(`peso,${w.measured_at},${w.weight_kg},kg,${(w.notes || "").replace(/[",\n]/g, " ")}`)
    })
    ;(foodLogs90 || []).forEach((l) => {
      const fecha = madridDateStr(new Date(l.logged_at))
      const detalle = `${(l.meal_name || "").replace(/[",\n]/g, " ")} P${Math.round(l.protein_g || 0)}g C${Math.round(l.carbs_g || 0)}g G${Math.round(l.fat_g || 0)}g`
      rows.push(`comida,${fecha},${Math.round(l.calories || 0)},kcal,${detalle}`)
    })
    const csv = rows.join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    const stamp = madridDateStr(new Date()).replace(/-/g, "")
    a.href = url
    a.download = `nutritrack-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success("CSV exportado")
  }

  const handleAddWeight = async () => {
    const weight = parseFloat(newWeight)
    if (!weight || weight < 30 || weight > 300) {
      toast.error("Introduce un peso válido (30-300 kg)")
      return
    }
    setSavingWeight(true)
    try {
      await createWeight.mutateAsync({ weight_kg: weight })
      toast.success("Peso registrado")
      setNewWeight("")
    } catch {
      toast.error("Error al guardar peso")
    } finally {
      setSavingWeight(false)
    }
  }

  if (weightLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px]" />
        <Skeleton className="h-24" />
        <Skeleton className="h-[200px]" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">Tu progreso</h2>

      {/* Quick weight entry */}
      <Card data-tour="weight">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Registrar peso de hoy</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                type="number"
                placeholder="Ej: 78.5"
                value={newWeight}
                onChange={(e) => setNewWeight(e.target.value)}
                step="0.1"
              />
            </div>
            <Button onClick={handleAddWeight} disabled={savingWeight} className="min-w-[100px]">
              {savingWeight ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Weight chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Peso (últimos 30 días)</CardTitle>
        </CardHeader>
        <CardContent>
          {weightChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="peso" name="Peso" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
                <Line type="monotone" dataKey="media" name="Media 7d" stroke="#2563eb" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                {goal?.target_weight_kg && (
                  <ReferenceLine y={goal.target_weight_kg} stroke="#f59e0b" strokeDasharray="5 5" label="Objetivo" />
                )}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Sin datos de peso aun. Registra tu primer peso arriba.</p>
          )}
        </CardContent>
      </Card>

      {/* Calorie adherence chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Calorías (última semana)</CardTitle>
        </CardHeader>
        <CardContent>
          {calorieChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={calorieChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="calorias" fill="#16a34a" radius={[4, 4, 0, 0]} />
                {goal?.daily_calories_target && (
                  <ReferenceLine y={goal.daily_calories_target} stroke="#f59e0b" strokeDasharray="5 5" label="Objetivo" />
                )}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center text-muted-foreground py-8">Sin datos de calorías esta semana.</p>
          )}
        </CardContent>
      </Card>

      {/* Adherencia semanal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Adherencia semanal</CardTitle>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-4xl font-bold text-primary">{adherencia.pct}%</p>
          <p className="text-sm text-muted-foreground mt-1">{adherencia.days} de 7 días en objetivo</p>
        </CardContent>
      </Card>

      {/* Export CSV */}
      <Button variant="outline" size="lg" className="w-full" onClick={handleExportCSV}>
        <Download className="h-5 w-5 mr-2" />
        Exportar CSV
      </Button>

      {/* Fotos de progreso */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Images className="h-4 w-4 text-primary" />
            Fotos de progreso
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              className="flex-1"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? <Loader2 className="h-5 w-5 animate-spin" /> : (
                <>
                  <Camera className="h-5 w-5 mr-2" />
                  Subir foto
                </>
              )}
            </Button>
            <Button
              type="button"
              size="lg"
              variant="outline"
              onClick={() => {
                if (photos.length < 2) {
                  toast.error("Necesitas al menos 2 fotos")
                  return
                }
                setCompareMode((v) => !v)
                setCompareSelection([])
              }}
            >
              {compareMode ? "Cancelar" : "Comparar"}
            </Button>
          </div>
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoSelect}
          />
          {compareMode && (
            <p className="text-xs text-muted-foreground">Selecciona 2 fotos para compararlas.</p>
          )}
          {photos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Aún no tienes fotos. Sube una para empezar tu seguimiento visual.
            </p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
              {photos.map((p, idx) => {
                const selected = compareSelection.includes(idx)
                return (
                  <button
                    key={`${p.date}-${idx}`}
                    type="button"
                    onClick={() => {
                      if (compareMode) togglePhotoSelection(idx)
                      else setViewerPhoto(p)
                    }}
                    className={`relative shrink-0 rounded-xl overflow-hidden border-2 ${
                      selected ? "border-primary" : "border-border"
                    }`}
                  >
                    <img src={p.dataUrl} alt={`Foto ${p.date}`} className="h-24 w-24 object-cover" />
                    <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] py-0.5 text-center">
                      {p.date}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visor de foto individual */}
      <Dialog open={!!viewerPhoto} onOpenChange={(v) => { if (!v) setViewerPhoto(null) }}>
        <DialogContent className="max-w-md">
          {viewerPhoto && (
            <div className="space-y-2">
              <img src={viewerPhoto.dataUrl} alt="Foto" className="w-full rounded-lg" />
              <p className="text-sm text-center text-muted-foreground">{viewerPhoto.date}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Comparador */}
      <Dialog
        open={!!comparePair}
        onOpenChange={(v) => {
          if (!v) {
            setComparePair(null)
            setCompareSelection([])
            setCompareMode(false)
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          {comparePair && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <img src={comparePair[0].dataUrl} alt="Antes" className="w-full rounded-lg" />
                  <p className="text-xs text-center text-muted-foreground mt-1">{comparePair[0].date}</p>
                </div>
                <div>
                  <img src={comparePair[1].dataUrl} alt="Después" className="w-full rounded-lg" />
                  <p className="text-xs text-center text-muted-foreground mt-1">{comparePair[1].date}</p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Stats cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <TrendingDown className="h-6 w-6 mx-auto mb-1 text-primary" />
            <p className="text-xs text-muted-foreground">Peso actual</p>
            <p className="text-xl font-bold">{currentWeight} kg</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Target className="h-6 w-6 mx-auto mb-1 text-amber-500" />
            <p className="text-xs text-muted-foreground">Peso objetivo</p>
            <p className="text-xl font-bold">{goal?.target_weight_kg || "--"} kg</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Activity className="h-6 w-6 mx-auto mb-1 text-blue-500" />
            <p className="text-xs text-muted-foreground">IMC</p>
            <p className="text-xl font-bold">{bmi || "--"}</p>
            <p className="text-xs text-muted-foreground">{bmi ? getBMICategory(bmi) : ""}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Flame className="h-6 w-6 mx-auto mb-1 text-orange-500" />
            <p className="text-xs text-muted-foreground">Racha</p>
            <p className="text-xl font-bold flex items-center justify-center gap-1"><Flame className="h-4 w-4 text-orange-500" />{streak} días</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
