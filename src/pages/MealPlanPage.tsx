import { useState, useMemo } from "react"
import { useMealPlan } from "@/hooks/use-meal-plan"
import { useCreateFoodLog, useFoodLog } from "@/hooks/use-food-log"
import { useSwapMeal, useSuggestMeal } from "@/hooks/use-ai"
import { Input } from "@/components/ui/input"
import { useMealPlanGeneration } from "@/contexts/MealPlanGenerationContext"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "sonner"
import { formatCalories, formatMacro, MEAL_TYPE_LABELS, MEAL_TYPE_ICONS } from "@/lib/nutrition"
import type { MealPlanItem } from "@/integrations/supabase/types"
import { ChevronLeft, ChevronRight, Check, ChevronDown, ChevronUp, Loader2, UtensilsCrossed, Sparkles, Refrigerator, CalendarRange, ShoppingCart, Trash2 } from "lucide-react"
import type { MealType } from "@/integrations/supabase/types"
import { format, addDays, subDays, startOfWeek } from "date-fns"
import { es } from "date-fns/locale"
import { DailyContextForm } from "@/components/plan/DailyContextForm"
import { EditFoodLogDialog } from "@/components/log/EditFoodLogDialog"
import type { FoodLog } from "@/integrations/supabase/types"
import { PantryScreen } from "@/components/pantry/PantryScreen"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Link } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"
import { useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@/contexts/AuthContext"

function MealCard({
  item,
  onLog,
  onSwap,
  onDelete,
}: {
  item: MealPlanItem
  onLog: (item: MealPlanItem) => void
  onSwap: (item: MealPlanItem) => Promise<void>
  onDelete: (item: MealPlanItem) => Promise<void>
}) {
  const [expanded, setExpanded] = useState(false)
  const [logging, setLogging] = useState(false)
  const [swapping, setSwapping] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar "${item.meal_name}" del plan?`)) return
    setDeleting(true)
    try {
      await onDelete(item)
    } finally {
      setDeleting(false)
    }
  }

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
          <div className="flex items-center gap-1">
            <Badge variant="secondary">{item.calories ? formatCalories(item.calories) : "--"}</Badge>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              aria-label="Eliminar comida"
              className="flex items-center justify-center w-12 h-12 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Macros */}
        <div className="flex gap-2">
          <Badge variant="outline" className="text-xs">P: {item.protein_g ? formatMacro(item.protein_g) : "--"}</Badge>
          <Badge variant="outline" className="text-xs">C: {item.carbs_g ? formatMacro(item.carbs_g) : "--"}</Badge>
          <Badge variant="outline" className="text-xs">G: {item.fat_g ? formatMacro(item.fat_g) : "--"}</Badge>
          <Badge variant="outline" className="text-xs">Fibra: {item.fiber_g != null ? formatMacro(item.fiber_g) : "—"}</Badge>
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
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { data: plan, isLoading } = useMealPlan(dateStr)
  const { data: todayLog } = useFoodLog(`${dateStr}T00:00:00`, `${dateStr}T23:59:59`)
  const createFoodLog = useCreateFoodLog()
  const swapMeal = useSwapMeal()
  const suggestMeal = useSuggestMeal()
  const [suggestingType, setSuggestingType] = useState<MealType | null>(null)
  const [suggestNotes, setSuggestNotes] = useState("")
  const [editingLog, setEditingLog] = useState<FoodLog | null>(null)
  const { start: startGenerate, isGenerating } = useMealPlanGeneration()
  const generating = isGenerating(dateStr)
  const [pantryOpen, setPantryOpen] = useState(false)
  const [weekGenOpen, setWeekGenOpen] = useState(false)
  const [weekGenRunning, setWeekGenRunning] = useState(false)
  const [weekGenProgress, setWeekGenProgress] = useState(0)
  const [weekGenCurrentDay, setWeekGenCurrentDay] = useState<string>("")

  const weekDayLabelsLong = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

  const handleGenerateWeek = async () => {
    setWeekGenRunning(true)
    setWeekGenProgress(0)
    const ws = startOfWeek(date, { weekStartsOn: 1 })
    try {
      for (let i = 0; i < 7; i++) {
        const d = addDays(ws, i)
        const ds = format(d, "yyyy-MM-dd")
        setWeekGenCurrentDay(weekDayLabelsLong[i])
        setWeekGenProgress(Math.round((i / 7) * 100))
        await startGenerate(ds)
      }
      setWeekGenProgress(100)
      toast.success("Semana generada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al generar semana")
    } finally {
      setWeekGenRunning(false)
      setWeekGenOpen(false)
    }
  }

  const handleGenerateWithContext = (activities: string, preferences: string) => {
    // Fire-and-forget so navigation doesn't cancel the request.
    void startGenerate(dateStr, {
      daily_activities: activities || undefined,
      preferences: preferences || undefined,
    })
  }

  const handleDeleteItem = async (item: MealPlanItem) => {
    const snapshot = { ...item }
    try {
      const { error } = await supabase
        .from("meal_plan_items")
        .delete()
        .eq("id", item.id)
      if (error) throw error
      queryClient.invalidateQueries({ queryKey: ["meal-plan", user?.id, dateStr] })
      toast.success("Comida eliminada del plan", {
        action: {
          label: "Deshacer",
          onClick: async () => {
            try {
              const { error: insErr } = await supabase
                .from("meal_plan_items")
                .insert(snapshot as never)
              if (insErr) throw insErr
              queryClient.invalidateQueries({ queryKey: ["meal-plan", user?.id, dateStr] })
              toast.success("Comida restaurada")
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "No se pudo restaurar")
            }
          },
        },
      })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al eliminar")
    }
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

  const ALL_MEAL_TYPES: MealType[] = ["breakfast", "morning_snack", "lunch", "afternoon_snack", "dinner"]
  const usedMealTypes = new Set<string>([
    ...(plan?.items.map((i) => i.meal_type) ?? []),
    ...((todayLog ?? []).map((l) => l.meal_type).filter(Boolean) as string[]),
  ])
  const emptySlots = ALL_MEAL_TYPES.filter((t) => !usedMealTypes.has(t))

  const handleSuggest = async (mealType: MealType) => {
    try {
      await suggestMeal.mutateAsync({
        plan_date: dateStr,
        meal_type: mealType,
        notes: suggestNotes || undefined,
      })
      setSuggestingType(null)
      setSuggestNotes("")
      toast.success("Sugerencia añadida al plan")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al sugerir")
    }
  }

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

  // Week strip (Mon-Sun)
  const weekStart = startOfWeek(date, { weekStartsOn: 1 })
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const todayStr = format(new Date(), "yyyy-MM-dd")
  const dayLabels = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

  return (
    <div className="space-y-4">
      {/* Quick actions: pantry + shopping list */}
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => setPantryOpen((v) => !v)}
        >
          <Refrigerator className="h-4 w-4 mr-1" /> Despensa
        </Button>
        <Button asChild variant="outline" size="sm" className="flex-1">
          <Link to="/compra">
            <ShoppingCart className="h-4 w-4 mr-1" /> Lista de la compra
          </Link>
        </Button>
      </div>

      {pantryOpen && <PantryScreen onClose={() => setPantryOpen(false)} />}

      {/* Week strip */}
      <div className="grid grid-cols-7 gap-1">
        {weekDays.map((d, i) => {
          const ds = format(d, "yyyy-MM-dd")
          const isSelected = ds === dateStr
          const isTodayPill = ds === todayStr
          return (
            <button
              key={ds}
              type="button"
              onClick={() => setDate(d)}
              className={`flex flex-col items-center justify-center rounded-xl py-2 min-h-[56px] border transition-colors ${
                isSelected
                  ? "bg-primary text-primary-foreground border-primary"
                  : isTodayPill
                  ? "bg-accent border-primary/40 text-foreground"
                  : "bg-background border-border text-foreground hover:bg-secondary"
              }`}
              aria-pressed={isSelected}
            >
              <span className="text-[11px] font-medium uppercase tracking-wide">{dayLabels[i]}</span>
              <span className="text-base font-bold tabular-nums">{format(d, "d")}</span>
            </button>
          )
        })}
      </div>

      {/* Generate week */}
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        onClick={() => setWeekGenOpen(true)}
        disabled={weekGenRunning}
      >
        {weekGenRunning ? (
          <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Generando semana...</>
        ) : (
          <><CalendarRange className="h-4 w-4 mr-1" /> Generar semana</>
        )}
      </Button>

      {/* Date selector */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="icon" aria-label="Día anterior" onClick={() => setDate(subDays(date, 1))}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <div className="text-center">
          <p className="text-lg font-semibold capitalize">
            {isToday ? "Hoy" : format(date, "EEEE", { locale: es })}
          </p>
          <p className="text-sm text-muted-foreground">{format(date, "d 'de' MMMM", { locale: es })}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Día siguiente" onClick={() => setDate(addDays(date, 1))}>
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
          {todayLog && todayLog.length > 0 && (
            <Card className="bg-secondary border-border">
              <CardContent className="p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold mb-2">Ya registrado hoy</p>
                {todayLog.map((l) => (
                  <p key={l.id} className="text-sm">• {l.meal_name} — {l.calories ?? 0} kcal</p>
                ))}
                <p className="text-xs text-muted-foreground mt-2">Al generar el plan se tendra en cuenta esto.</p>
              </CardContent>
            </Card>
          )}
          <div data-tour="plan-generate">
            <DailyContextForm
              onSubmit={handleGenerateWithContext}
              generating={generating}
              loggedMealTypes={(todayLog ?? [])
                .map((l) => l.meal_type)
                .filter((t): t is MealType => !!t)}
            />
          </div>
          {generating && (
            <p className="text-xs text-muted-foreground text-center">Puedes cambiar de pestaña, seguiremos generando.</p>
          )}
        </div>
      ) : (
        <>
          {/* Already-logged meals for today */}
          {todayLog && todayLog.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Ya registrado hoy</p>
              {todayLog.map((l) => (
                <Card key={l.id} className="bg-secondary border-border">
                  <CardContent className="p-3">
                    <button
                      type="button"
                      onClick={() => setEditingLog(l)}
                      className="w-full flex items-center justify-between gap-2 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium flex items-center gap-1 text-foreground">
                          <Check className="h-4 w-4 text-primary" />
                          {l.meal_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {l.calories ?? 0} kcal · P {l.protein_g ?? 0}g · C {l.carbs_g ?? 0}g · G {l.fat_g ?? 0}g
                        </p>
                      </div>
                      {l.meal_type && (
                        <Badge variant="outline" className="text-xs">{MEAL_TYPE_LABELS[l.meal_type]}</Badge>
                      )}
                    </button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Meal cards */}
          <div className="space-y-3">
            {plan.items.map((item) => (
              <MealCard key={item.id} item={item} onLog={handleLogMeal} onSwap={handleSwap} onDelete={handleDeleteItem} />
            ))}
          </div>

          {/* Suggest missing meals */}
          {emptySlots.length > 0 && (
            <Card className="border-dashed">
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-semibold flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-primary" /> Pedir sugerencia
                </p>
                <p className="text-xs text-muted-foreground">
                  Pide a la IA que te proponga una comida para un hueco del día. Tendrá en cuenta lo que ya has comido.
                </p>
                {suggestingType ? (
                  <div className="space-y-2">
                    <p className="text-sm">Sugiriendo <strong>{MEAL_TYPE_LABELS[suggestingType]}</strong></p>
                    <Input
                      placeholder="Opcional: 'algo ligero y rápido', 'con pollo'..."
                      value={suggestNotes}
                      onChange={(e) => setSuggestNotes(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => handleSuggest(suggestingType)}
                        disabled={suggestMeal.isPending}
                        className="flex-1"
                      >
                        {suggestMeal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sugerir"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSuggestingType(null); setSuggestNotes("") }}
                        disabled={suggestMeal.isPending}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {emptySlots.map((t) => (
                      <Button
                        key={t}
                        size="sm"
                        variant="outline"
                        onClick={() => setSuggestingType(t)}
                      >
                        + {MEAL_TYPE_LABELS[t]}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Daily totals */}
          <Card className="bg-accent">
            <CardContent className="p-4">
              <p className="text-sm font-medium text-muted-foreground mb-2">Total del día</p>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-primary">{formatCalories(dailyTotals.calories)}</p>
                  <p className="text-xs text-muted-foreground">Calorías</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-blue-700">{formatMacro(dailyTotals.protein)}</p>
                  <p className="text-xs text-muted-foreground">Proteína</p>
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

      <Dialog open={weekGenOpen} onOpenChange={(v) => { if (!weekGenRunning) setWeekGenOpen(v) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar plan de la semana</DialogTitle>
          </DialogHeader>
          {weekGenRunning ? (
            <div className="space-y-3">
              <p className="text-sm">
                Día <strong>{Math.min(7, Math.floor((weekGenProgress / 100) * 7) + 1)}</strong> de 7
                {weekGenCurrentDay && <> · <span className="capitalize">{weekGenCurrentDay}</span></>}
              </p>
              <Progress value={weekGenProgress} />
              <p className="text-xs text-muted-foreground">
                Generando los 7 días de forma secuencial. No cierres la app.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Se generarán los 7 días (Lun-Dom) de la semana actual de forma secuencial. Tardará unos minutos.
            </p>
          )}
          <DialogFooter>
            {!weekGenRunning && (
              <>
                <Button variant="outline" onClick={() => setWeekGenOpen(false)}>Cancelar</Button>
                <Button onClick={handleGenerateWeek}>Empezar</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditFoodLogDialog
        log={editingLog}
        open={!!editingLog}
        onOpenChange={(v) => { if (!v) setEditingLog(null) }}
      />
    </div>
  )
}
