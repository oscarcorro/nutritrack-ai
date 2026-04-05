import { useMemo } from "react"
import { Link } from "react-router-dom"
import { useProfile } from "@/hooks/use-profile"
import { useCurrentGoal } from "@/hooks/use-goals"
import { useTodayFoodLog } from "@/hooks/use-food-log"
import { useMealPlan } from "@/hooks/use-meal-plan"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCalories, formatMacro, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from "@/lib/nutrition"
import { Plus, Scale, UtensilsCrossed } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const percentage = Math.min((consumed / target) * 100, 100)
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference

  const color = percentage > 100 ? "#ef4444" : "#16a34a"

  return (
    <div className="relative flex items-center justify-center">
      <svg width="180" height="180" viewBox="0 0 180 180">
        <circle cx="90" cy="90" r={radius} fill="none" stroke="#e7e5e4" strokeWidth="12" />
        <circle
          cx="90"
          cy="90"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 90 90)"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-3xl font-bold">{Math.round(consumed)}</p>
        <p className="text-sm text-muted-foreground">de {formatCalories(target)}</p>
      </div>
    </div>
  )
}

export default function HomePage() {
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: goal, isLoading: goalLoading } = useCurrentGoal()
  const { data: foodLogs, isLoading: logsLoading } = useTodayFoodLog()
  const today = new Date().toISOString().split("T")[0]
  const { data: mealPlan } = useMealPlan(today)

  const todayStats = useMemo(() => {
    if (!foodLogs) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return foodLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + (log.calories || 0),
        protein: acc.protein + (log.protein_g || 0),
        carbs: acc.carbs + (log.carbs_g || 0),
        fat: acc.fat + (log.fat_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }, [foodLogs])

  // Find next upcoming meal from plan
  const nextMeal = useMemo(() => {
    if (!mealPlan?.items?.length) return null
    const loggedMealTypes = new Set((foodLogs || []).map((l) => l.meal_type))
    return mealPlan.items.find((item) => !loggedMealTypes.has(item.meal_type)) || null
  }, [mealPlan, foodLogs])

  const isLoading = profileLoading || goalLoading || logsLoading

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[200px] w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const dateStr = format(new Date(), "EEEE, d 'de' MMMM", { locale: es })

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h2 className="text-2xl font-bold">Hola, {profile?.display_name?.split(" ")[0] || "amigo"}</h2>
        <p className="text-muted-foreground capitalize">{dateStr}</p>
      </div>

      {/* Calorie ring */}
      {goal && (
        <Card>
          <CardContent className="flex flex-col items-center py-5">
            <CalorieRing consumed={todayStats.calories} target={goal.daily_calories_target} />
            {/* Macro badges */}
            <div className="grid grid-cols-3 gap-3 w-full mt-4">
              <div className="text-center p-2 rounded-xl bg-blue-50">
                <p className="text-xs text-muted-foreground">Proteina</p>
                <p className="text-base font-bold text-blue-700">
                  {formatMacro(todayStats.protein)} / {formatMacro(goal.protein_g)}
                </p>
              </div>
              <div className="text-center p-2 rounded-xl bg-amber-50">
                <p className="text-xs text-muted-foreground">Carbos</p>
                <p className="text-base font-bold text-amber-700">
                  {formatMacro(todayStats.carbs)} / {formatMacro(goal.carbs_g)}
                </p>
              </div>
              <div className="text-center p-2 rounded-xl bg-rose-50">
                <p className="text-xs text-muted-foreground">Grasa</p>
                <p className="text-base font-bold text-rose-700">
                  {formatMacro(todayStats.fat)} / {formatMacro(goal.fat_g)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-3">
        <Button asChild size="lg" className="h-14 text-base">
          <Link to="/registrar">
            <Plus className="h-5 w-5 mr-2" />
            Registrar comida
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="h-14 text-base">
          <Link to="/progreso">
            <Scale className="h-5 w-5 mr-2" />
            Pesar
          </Link>
        </Button>
      </div>

      {/* Next meal preview */}
      {nextMeal && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-muted-foreground flex items-center gap-2">
              <UtensilsCrossed className="h-4 w-4" />
              Proxima comida
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-lg font-semibold">{nextMeal.meal_name}</p>
                <p className="text-sm text-muted-foreground">
                  {MEAL_TYPE_ICONS[nextMeal.meal_type]} {MEAL_TYPE_LABELS[nextMeal.meal_type]}
                </p>
              </div>
              <Badge variant="secondary">{nextMeal.calories ? formatCalories(nextMeal.calories) : "--"}</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's logged meals */}
      {foodLogs && foodLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registros de hoy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {foodLogs.map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-medium">{log.meal_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {log.meal_type ? `${MEAL_TYPE_ICONS[log.meal_type]} ${MEAL_TYPE_LABELS[log.meal_type]}` : ""}
                  </p>
                </div>
                <Badge variant="outline">{log.calories ? formatCalories(log.calories) : "--"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
