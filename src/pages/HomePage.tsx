import { useMemo, useState, useCallback } from "react"
import { EditFoodLogDialog } from "@/components/log/EditFoodLogDialog"
import type { FoodLog } from "@/integrations/supabase/types"
import { Pencil, Bookmark } from "lucide-react"
import { addRecipe, isRecipeSaved, deleteRecipeByName } from "@/lib/recipes"
import { toast } from "sonner"
import { Link } from "react-router-dom"
import { useProfile } from "@/hooks/use-profile"
import { useCurrentGoal } from "@/hooks/use-goals"
import { useTodayFoodLog } from "@/hooks/use-food-log"
import { useMealPlan } from "@/hooks/use-meal-plan"
import { useWeightLog } from "@/hooks/use-weight-log"
import { HydrationCard } from "@/components/home/HydrationCard"
import { WeeklyInsights } from "@/components/home/WeeklyInsights"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCalories, formatMacro, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from "@/lib/nutrition"
import { Plus, Scale, UtensilsCrossed, Camera, Mic, Type } from "lucide-react"
import { format } from "date-fns"
import { es } from "date-fns/locale"

function CalorieRing({ consumed, target }: { consumed: number; target: number }) {
  const rawPct = (consumed / target) * 100
  const percentage = Math.min(rawPct, 100)
  const radius = 78
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (percentage / 100) * circumference
  const over = rawPct > 100
  const remaining = Math.max(0, Math.round(target - consumed))

  return (
    <div className="relative flex items-center justify-center">
      <svg width="200" height="200" viewBox="0 0 200 200" className="drop-shadow-[0_8px_20px_rgba(21,134,74,0.18)]">
        <defs>
          <linearGradient id="nt-ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2bb76a" />
            <stop offset="100%" stopColor="#117a41" />
          </linearGradient>
          <linearGradient id="nt-ring-over" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#e0453a" />
          </linearGradient>
        </defs>
        <circle cx="100" cy="100" r={radius} fill="none" stroke="#ece9e1" strokeWidth="14" />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke={over ? "url(#nt-ring-over)" : "url(#nt-ring-grad)"}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          transform="rotate(-90 100 100)"
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute text-center">
        <p className="text-[13px] font-medium text-muted-foreground uppercase tracking-wide">
          {over ? "Excedido" : "Restantes"}
        </p>
        <p className="text-4xl font-bold leading-tight tabular-nums">
          {over ? Math.round(consumed - target) : remaining}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          {Math.round(consumed)} / {formatCalories(target)}
        </p>
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
  const { data: recentWeights } = useWeightLog(14)
  const currentWeightKg = recentWeights && recentWeights.length > 0
    ? recentWeights[recentWeights.length - 1].weight_kg
    : profile?.weight_kg ?? null

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

  // Default suggested time per meal type (Madrid schedule)
  const MEAL_DEFAULT_TIME: Record<string, string> = {
    breakfast: "08:30",
    morning_snack: "11:00",
    lunch: "14:00",
    afternoon_snack: "17:30",
    dinner: "21:00",
  }

  // Current time in Europe/Madrid as HH:MM
  const madridNowHHMM = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("es-ES", {
        timeZone: "Europe/Madrid",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date())
    } catch {
      const d = new Date()
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`
    }
  }, [])

  // Find next upcoming meal whose suggested time > now
  const nextMeal = useMemo(() => {
    if (!mealPlan?.items?.length) return null
    const loggedMealTypes = new Set((foodLogs || []).map((l) => l.meal_type))
    const upcoming = mealPlan.items
      .filter((item) => !loggedMealTypes.has(item.meal_type))
      .map((item) => ({ item, time: MEAL_DEFAULT_TIME[item.meal_type] || "23:59" }))
      .sort((a, b) => a.time.localeCompare(b.time))
      .find((x) => x.time > madridNowHHMM)
    return upcoming || null
  }, [mealPlan, foodLogs, madridNowHHMM])

  const allMealsDone = !!mealPlan?.items?.length && !nextMeal
    && mealPlan.items.every((it) => (foodLogs || []).some((l) => l.meal_type === it.meal_type))

  const [editingLog, setEditingLog] = useState<FoodLog | null>(null)

  const isLoading = profileLoading || goalLoading || logsLoading

  if (isLoading) {
    return (
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg nt-shimmer" />
          <div className="h-4 w-32 rounded nt-shimmer" />
        </div>
        <div className="h-[300px] w-full rounded-2xl nt-shimmer" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-14 rounded-xl nt-shimmer" />
          <div className="h-14 rounded-xl nt-shimmer" />
        </div>
        <div className="h-24 w-full rounded-2xl nt-shimmer" />
      </div>
    )
  }

  const dateStr = format(new Date(), "EEEE, d 'de' MMMM", { locale: es })

  const macroPct = (val: number, target: number) =>
    Math.max(0, Math.min(100, target > 0 ? (val / target) * 100 : 0))

  return (
    <div className="space-y-5 nt-stagger">
      {/* Greeting */}
      <div>
        <p className="text-sm text-muted-foreground capitalize">{dateStr}</p>
        <h2 className="text-[28px] font-bold tracking-tight leading-tight">
          Hola, {profile?.display_name?.split(" ")[0] || "amigo"}
        </h2>
      </div>

      {/* Calorie ring empty state */}
      {!goal && (
        <Card data-tour="ring">
          <CardContent className="py-8 text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-full bg-secondary flex items-center justify-center">
              <Scale className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="text-base font-medium">Aún no tienes objetivos definidos</p>
            <p className="text-sm text-muted-foreground">Define tus objetivos en Perfil para ver tu anillo de calorías.</p>
            <Button asChild size="lg" className="mt-2">
              <Link to="/perfil">Ir a Perfil</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Calorie ring */}
      {goal && (
        <Card data-tour="ring" className="overflow-hidden">
          <CardContent className="flex flex-col items-center py-6">
            <CalorieRing consumed={todayStats.calories} target={goal.daily_calories_target} />
            {/* Macro bars */}
            <div className="grid grid-cols-3 gap-3 w-full mt-5">
              <div className="p-3 rounded-xl bg-[#eff6ff] border border-[#dbeafe]">
                <p className="text-[11px] font-medium text-blue-700/80 uppercase tracking-wide">Proteína</p>
                <p className="text-[15px] font-bold text-blue-800 tabular-nums mt-0.5">
                  {formatMacro(todayStats.protein)}
                  <span className="text-xs font-medium text-blue-700/70"> / {formatMacro(goal.protein_g)}</span>
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-blue-100 overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full transition-all duration-700"
                    style={{ width: `${macroPct(todayStats.protein, goal.protein_g)}%` }}
                  />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#fffbeb] border border-[#fde68a]">
                <p className="text-[11px] font-medium text-amber-700/80 uppercase tracking-wide">Carbos</p>
                <p className="text-[15px] font-bold text-amber-800 tabular-nums mt-0.5">
                  {formatMacro(todayStats.carbs)}
                  <span className="text-xs font-medium text-amber-700/70"> / {formatMacro(goal.carbs_g)}</span>
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-amber-100 overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-700"
                    style={{ width: `${macroPct(todayStats.carbs, goal.carbs_g)}%` }}
                  />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-[#fff1f2] border border-[#fecdd3]">
                <p className="text-[11px] font-medium text-rose-700/80 uppercase tracking-wide">Grasa</p>
                <p className="text-[15px] font-bold text-rose-800 tabular-nums mt-0.5">
                  {formatMacro(todayStats.fat)}
                  <span className="text-xs font-medium text-rose-700/70"> / {formatMacro(goal.fat_g)}</span>
                </p>
                <div className="mt-2 h-1.5 rounded-full bg-rose-100 overflow-hidden">
                  <div
                    className="h-full bg-rose-500 rounded-full transition-all duration-700"
                    style={{ width: `${macroPct(todayStats.fat, goal.fat_g)}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidratación */}
      <HydrationCard weightKg={currentWeightKg} />

      {/* Insights semanales (solo lunes) */}
      <WeeklyInsights />

      {/* Quick actions */}
      <div data-tour="quick-actions" className="space-y-3">
        <Button asChild size="lg" className="h-14 text-base w-full">
          <Link to="/registrar">
            <Plus className="h-5 w-5 mr-2" />
            Registrar comida
          </Link>
        </Button>
        <div className="grid grid-cols-3 gap-2">
          <Button asChild variant="outline" size="lg" className="h-14 text-sm flex-col gap-0.5">
            <Link to="/registrar" state={{ method: "photo" }}>
              <Camera className="h-5 w-5" />
              <span>Foto</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 text-sm flex-col gap-0.5">
            <Link to="/registrar" state={{ method: "audio" }}>
              <Mic className="h-5 w-5" />
              <span>Audio</span>
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-14 text-sm flex-col gap-0.5">
            <Link to="/registrar" state={{ method: "text" }}>
              <Type className="h-5 w-5" />
              <span>Texto</span>
            </Link>
          </Button>
        </div>
        <Button asChild variant="outline" size="lg" className="h-14 text-base w-full">
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
              Próxima comida
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold truncate">{nextMeal.item.meal_name}</p>
                <p className="text-sm text-muted-foreground">
                  {MEAL_TYPE_ICONS[nextMeal.item.meal_type]} {MEAL_TYPE_LABELS[nextMeal.item.meal_type]} · {nextMeal.time}
                </p>
              </div>
              <Badge variant="secondary">{nextMeal.item.calories ? formatCalories(nextMeal.item.calories) : "--"}</Badge>
            </div>
          </CardContent>
        </Card>
      )}
      {allMealsDone && (
        <Card className="bg-green-50 border-green-200">
          <CardContent className="py-4 text-center">
            <p className="text-base font-medium text-green-800">Has completado todas las comidas de hoy</p>
          </CardContent>
        </Card>
      )}

      {/* Today's logged meals */}
      {foodLogs && foodLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registros de hoy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {foodLogs.map((log) => {
              const saved = isRecipeSaved(log.meal_name)
              const toggleRecipe = (e: React.MouseEvent) => {
                e.stopPropagation()
                if (saved) {
                  deleteRecipeByName(log.meal_name)
                  toast.success("Receta eliminada")
                } else {
                  const ings = Array.isArray(log.items)
                    ? (log.items as Array<{ name?: string; quantity_g?: number } | string>).map((i) =>
                        typeof i === "string" ? i : i.quantity_g ? `${i.name ?? ""} (${i.quantity_g} g)` : (i.name ?? "")
                      ).filter(Boolean)
                    : []
                  addRecipe({ name: log.meal_name, ingredients: ings, steps: [], kcal: Math.round(log.calories ?? 0) })
                  toast.success("Guardado en Mis recetas")
                }
              }
              return (
                <div
                  key={log.id}
                  className="w-full flex items-center justify-between gap-2 py-2 border-b border-border last:border-0 rounded-md px-1 -mx-1"
                >
                  <button
                    type="button"
                    onClick={() => setEditingLog(log)}
                    className="flex-1 flex items-center justify-between gap-2 text-left min-w-0 group"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{log.meal_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {log.meal_type ? `${MEAL_TYPE_ICONS[log.meal_type]} ${MEAL_TYPE_LABELS[log.meal_type]}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline">{log.calories ? formatCalories(log.calories) : "--"}</Badge>
                    <Pencil className="h-4 w-4 text-muted-foreground group-hover:text-primary group-active:text-primary shrink-0 transition-colors" />
                  </button>
                  <button
                    type="button"
                    onClick={toggleRecipe}
                    aria-label={saved ? "Quitar receta" : "Guardar como receta"}
                    className={`flex items-center justify-center w-10 h-10 rounded-md shrink-0 transition-colors ${saved ? "text-primary" : "text-muted-foreground hover:text-primary"}`}
                  >
                    <Bookmark className={`h-4 w-4 ${saved ? "fill-primary" : ""}`} />
                  </button>
                </div>
              )
            })}
            <p className="text-xs text-muted-foreground pt-1">Toca para editar o eliminar.</p>
          </CardContent>
        </Card>
      )}

      <EditFoodLogDialog
        log={editingLog}
        open={!!editingLog}
        onOpenChange={(v) => { if (!v) setEditingLog(null) }}
      />
    </div>
  )
}
