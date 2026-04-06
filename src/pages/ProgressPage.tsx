import { useState, useMemo } from "react"
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
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts"
import { Loader2, TrendingDown, Target, Activity, Flame } from "lucide-react"
import { format, subDays } from "date-fns"
import { es } from "date-fns/locale"

export default function ProgressPage() {
  const { data: weightLogs, isLoading: weightLoading } = useWeightLog(30)
  const { data: goal } = useCurrentGoal()
  const { data: profile } = useProfile()
  const createWeight = useCreateWeightLog()

  const [newWeight, setNewWeight] = useState("")
  const [savingWeight, setSavingWeight] = useState(false)

  // Fetch last 7 days food log
  const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd")
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const { data: foodLogs } = useFoodLog(`${sevenDaysAgo}T00:00:00`, `${todayStr}T23:59:59`)

  // Weight chart data
  const weightChartData = useMemo(() => {
    if (!weightLogs) return []
    return weightLogs.map((log) => ({
      date: format(new Date(log.measured_at), "dd/MM"),
      peso: log.weight_kg,
    }))
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

  // Streak: consecutive days with food logs
  const streak = useMemo(() => {
    if (!foodLogs) return 0
    let count = 0
    for (let i = 0; i <= 6; i++) {
      const d = format(subDays(new Date(), i), "yyyy-MM-dd")
      const hasLog = foodLogs.some((l) => l.logged_at.startsWith(d))
      if (hasLog) count++
      else if (i > 0) break // allow today to be missing
    }
    return count
  }, [foodLogs])

  const handleAddWeight = async () => {
    const weight = parseFloat(newWeight)
    if (!weight || weight < 30 || weight > 300) {
      toast.error("Introduce un peso valido (30-300 kg)")
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
          <CardTitle className="text-base">Peso (ultimos 30 dias)</CardTitle>
        </CardHeader>
        <CardContent>
          {weightChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={weightChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="peso" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
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
          <CardTitle className="text-base">Calorias (ultima semana)</CardTitle>
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
            <p className="text-center text-muted-foreground py-8">Sin datos de calorias esta semana.</p>
          )}
        </CardContent>
      </Card>

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
            <p className="text-xl font-bold">{streak} dias</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
