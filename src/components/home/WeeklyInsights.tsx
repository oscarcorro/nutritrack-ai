import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Sparkles, X } from "lucide-react"
import { useFoodLog } from "@/hooks/use-food-log"
import { useWeightLog } from "@/hooks/use-weight-log"
import { useCurrentGoal } from "@/hooks/use-goals"
import { format, subDays } from "date-fns"

function madridDateStr(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d)
}

function madridWeekday(d: Date): number {
  // 1=Lunes ... 7=Domingo
  const name = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    weekday: "short",
  }).format(d)
  const map: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return map[name] ?? 1
}

function startOfMadridWeek(d: Date): string {
  const wd = madridWeekday(d)
  const monday = subDays(d, wd - 1)
  return madridDateStr(monday)
}

export function WeeklyInsights() {
  const isMonday = madridWeekday(new Date()) === 1
  const weekStart = startOfMadridWeek(new Date())
  const dismissKey = `nt:insights-dismissed:${weekStart}`

  const [dismissed, setDismissed] = useState<boolean>(false)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1")
    } catch {
      // ignore
    }
  }, [dismissKey])

  const sevenDaysAgo = format(subDays(new Date(), 6), "yyyy-MM-dd")
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const { data: foodLogs } = useFoodLog(`${sevenDaysAgo}T00:00:00`, `${todayStr}T23:59:59`)
  const { data: weightLogs } = useWeightLog(7)
  const { data: goal } = useCurrentGoal()

  const insights = useMemo(() => {
    if (!goal || !foodLogs) return null
    const target = goal.daily_calories_target
    const proteinTarget = goal.protein_g
    const min = target * 0.9
    const max = target * 1.1

    const byDate: Record<string, { kcal: number; protein: number; breakfastProtein: number }> = {}
    for (let i = 6; i >= 0; i--) {
      const d = madridDateStr(subDays(new Date(), i))
      byDate[d] = { kcal: 0, protein: 0, breakfastProtein: 0 }
    }
    foodLogs.forEach((l) => {
      const d = madridDateStr(new Date(l.logged_at))
      if (!byDate[d]) return
      byDate[d].kcal += l.calories || 0
      byDate[d].protein += l.protein_g || 0
      if (l.meal_type === "breakfast") byDate[d].breakfastProtein += l.protein_g || 0
    })

    const days = Object.values(byDate)
    const daysInTarget = days.filter((d) => d.kcal >= min && d.kcal <= max).length
    const avgProtein = Math.round(days.reduce((s, d) => s + d.protein, 0) / 7)
    const avgBreakfastProtein = days.reduce((s, d) => s + d.breakfastProtein, 0) / 7

    let weightDelta: number | null = null
    if (weightLogs && weightLogs.length >= 2) {
      const first = weightLogs[0].weight_kg
      const last = weightLogs[weightLogs.length - 1].weight_kg
      weightDelta = Math.round((last - first) * 10) / 10
    }

    const obs: string[] = []
    obs.push(`Cumpliste tu objetivo de calorías ${daysInTarget}/7 días.`)
    obs.push(`Tu proteína media fue ${avgProtein} g, objetivo ${Math.round(proteinTarget)} g.`)
    if (weightDelta !== null) {
      if (weightDelta < 0) obs.push(`Bajaste ${Math.abs(weightDelta)} kg esta semana.`)
      else if (weightDelta > 0) obs.push(`Subiste ${weightDelta} kg esta semana.`)
      else obs.push("Tu peso se mantuvo estable esta semana.")
    } else {
      obs.push("Registra tu peso varias veces a la semana para ver la tendencia.")
    }

    let suggestion = "Mantén el ritmo, vas muy bien."
    if (avgProtein < proteinTarget * 0.85) {
      suggestion = avgBreakfastProtein < proteinTarget / 5
        ? "Sube la proteína en los desayunos."
        : "Añade más proteína a tus comidas principales."
    } else if (daysInTarget < 4) {
      suggestion = "Intenta acercarte más a tu objetivo de calorías diarias."
    }

    return { obs, suggestion }
  }, [foodLogs, weightLogs, goal])

  if (!isMonday || dismissed || !insights) return null

  const handleDismiss = () => {
    try {
      localStorage.setItem(dismissKey, "1")
    } catch {
      // ignore
    }
    setDismissed(true)
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          Resumen de tu semana
        </CardTitle>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Descartar"
          className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-secondary text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </CardHeader>
      <CardContent className="space-y-2">
        <ul className="space-y-1.5">
          {insights.obs.map((o, i) => (
            <li key={i} className="text-sm flex gap-2">
              <span className="text-primary">•</span>
              <span>{o}</span>
            </li>
          ))}
        </ul>
        <div className="pt-2 border-t border-primary/10">
          <p className="text-sm font-medium">Sugerencia: {insights.suggestion}</p>
        </div>
        <Button variant="ghost" size="sm" className="w-full mt-1" onClick={handleDismiss}>
          Entendido
        </Button>
      </CardContent>
    </Card>
  )
}
