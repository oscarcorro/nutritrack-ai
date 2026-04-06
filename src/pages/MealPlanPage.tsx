import { useState, useMemo } from "react"
import { useMealPlan } from "@/hooks/use-meal-plan"
import { useCreateFoodLog } from "@/hooks/use-food-log"
import { useSwapMeal } from "@/hooks/use-ai"
import { useMealPlanGeneration } from "@/contexts/MealPlanGenerationContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatCalories, formatMacro, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from "@/lib/nutrition"
import type { MealPlanItem } from "@/integrations/supabase/types"
import { ChevronLeft, ChevronRight, Check, ChevronDown, ChevronUp, Loader2, UtensilsCrossed } from "lucide-react"
import { format, addDays, subDays } from "date-fns"
import { es } from "date-fns/locale"
import { DailyContextForm } from "@/components/plan/DailyContextForm"

function MealCard({
  item,
  onLog,
  onSwap,
}: {
  item: MealPlanItem
  onLog: (item: MealPlanItem) => void
  onSwap: (item: MealPlanItem) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [logging, setLogging] = useState(false)
  const [swapping, setSwapping] = useState(false)

  const handleLog = async () => {
    setLogging(true)
    await onLog(item)
    setLogging(false)
  }

  const handleSwap = async () => {
    setSwapping(true)
    try {
      await onSwap(item)
    } finally {
      setSwapping(false)
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{MEAL_TYPE_ICONS[item.meal_type]}</span>
              <span className="text-sm font-medium text-muted-foreground">{MEAL_TYPE_LABELS[item.meal_type]}</span>
            </div>
            <p className="text-lg font-semibold">{item.meal_name}</p>
          </div>
          <Badge variant="secondary">{item.calories ? formatCalories(item.calories) : "--"}</Badge>
        </div>

        {/* Macros */}
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">P: {item.protein_g ? formatMacro(item.protein_g) : "--"}</Badge>
          <Badge variant="outline" className="text-xs">C: {item.carbs_g ? formatMacro(item.carbs_g) : "--"}</Badge>
          <Badge variant="outline" className="text-xs">G: {item.fat_g ? formatMacro(item.fat_g) : "--"}</Badge>
        </div>

        {/* Recipe toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 text-sm text-primary font-medium min-h-[40px]"
        >
          {expanded ? "Ocultar receta" : "Ver receta"}
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {expanded && (
          <div className="space-y-3 bg-secondary/50 p-3 rounded-xl">
            {Array.isArray(item.ingredients) && (item.ingredients as Array<{ name: string; quantity_g: number }>).length > 0 && (
              <div>
                <div className="flex items-center gap-1 mb-2 text-sm font-semibold">
                  <UtensilsCrossed className="h-4 w-4" /> Ingredientes
                </div>
                <ul className="text-sm space-y-1">
                  {(item.ingredients as Array<{ name: string; quantity_g: number }>).map((ing, idx) => (
                    <li key={idx} className="flex justify-between">
                      <span>{ing.name}</span>
                      <span className="text-muted-foreground tabular-nums">{ing.quantity_g} g</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {item.description && (
              <div>
                <p className="text-sm font-semibold mb-1">Preparacion</p>
                <p className="text-sm text-muted-foreground whitespace-pre-line">{item.description}</p>
              </div>
            )}
            {item.prep_time_min != null && (
              <p className="text-xs text-muted-foreground">Tiempo: ~{item.prep_time_min} min</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleLog} disabled={logging} className="flex-1">
            {logging ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-1" /> Comi esto</>}
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={handleSwap} disabled={swapping}>
            {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : "Cambiar"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function MealPlanPage() {
  const [date, setDate] = useState(new Date())
  const dateStr = format(date, "yyyy-MM-dd")
  const { data: plan, isLoading } = useMealPlan(dateStr)
  const createFoodLog = useCreateFoodLog()
  const swapMeal = useSwapMeal()
  const { start: startGenerate, isGenerating } = useMealPlanGeneration()
  const generating = isGenerating(dateStr)

  const handleGenerateWithContext = (activities: string, preferences: string) => {
    // Fire-and-forget so navigation doesn't cancel the request.
    void startGenerate(dateStr, {
      daily_activities: activities || undefined,
      preferences: preferences || undefined,
    })
  }

  const handleSwap = async (item: MealPlanItem) => {
    try {
      await swapMeal.mutateAsync(item.id)
      toast.success("Comida cambiada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al cambiar")
    }
  }

  const isToday = format(new Date(), "yyyy-MM-dd") === dateStr

  const dailyTotals = useMemo(() => {
    if (!plan?.items) return { calories: 0, protein: 0, carbs: 0, fat: 0 }
    return plan.items.reduce(
      (acc, item) => ({
        calories: acc.calories + (item.calories || 0),
        protein: acc.protein + (item.protein_g || 0),
        carbs: acc.carbs + (item.carbs_g || 0),
        fat: acc.fat + (item.fat_g || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
  }, [plan])

  const handleLogMeal = async (item: MealPlanItem) => {
    try {
      await createFoodLog.mutateAsync({
        logged_at: new Date().toISOString(),
        meal_type: item.meal_type,
        input_method: "manual",
        raw_text: null,
        photo_url: null,
        audio_url: null,
        meal_name: item.meal_name,
        description: item.description,
        items: item.ingredients,
        calories: item.calories,
        protein_g: item.protein_g,
        carbs_g: item.carbs_g,
        fat_g: item.fat_g,
        fiber_g: item.fiber_g,
        meal_plan_item_id: item.id,
        ai_confidence: null,
        ai_model: null,
      })
      toast.success(`${item.meal_name} registrado`)
    } catch {
      toast.error("Error al registrar comida")
    }
  }

  return (
    <div className="space-y-4">
      {/* Date selector */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setDate(subDays(date, 1))}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="text-center">
          <p className="text-lg font-semibold capitalize">
            {isToday ? "Hoy" : format(date, "EEEE", { locale: es })}
          </p>
          <p className="text-sm text-muted-foreground">{format(date, "d 'de' MMMM", { locale: es })}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))}>
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : !plan ? (
        <div className="space-y-3">
          <DailyContextForm onSubmit={handleGenerateWithContext} generating={generating} />
          {generating && (
            <p className="text-xs text-muted-foreground text-center">Puedes cambiar de pestaña, seguiremos generando.</p>
          )}
        </div>
      ) : (
        <>
          {/* Meal cards */}
          <div className="space-y-3">
            {plan.items.map((item) => (
              <MealCard key={item.id} item={item} onLog={handleLogMeal} onSwap={handleSwap} />
            ))}
          </div>

          {/* Daily totals */}
          <Card className="bg-accent">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Total del dia</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-primary">{formatCalories(dailyTotals.calories)}</p>
                  <p className="text-xs text-muted-foreground">Calorias</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{formatMacro(dailyTotals.protein)}</p>
                  <p className="text-xs text-muted-foreground">Proteina</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-amber-700">{formatMacro(dailyTotals.carbs)}</p>
                  <p className="text-xs text-muted-foreground">Carbos</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-rose-700">{formatMacro(dailyTotals.fat)}</p>
                  <p className="text-xs text-muted-foreground">Grasa</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
