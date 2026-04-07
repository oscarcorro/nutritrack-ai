import { useEffect, useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Link } from "react-router-dom"
import { format, startOfWeek, addDays } from "date-fns"
import { es } from "date-fns/locale"
import { ChevronLeft, Share2, Eraser, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import type { MealPlan, MealPlanItem } from "@/integrations/supabase/types"

const SHOPPING_KEY = "nt:shopping:v1"

interface CheckedMap {
  [weekStart: string]: { [itemKey: string]: boolean }
}

function loadChecked(): CheckedMap {
  try {
    const raw = localStorage.getItem(SHOPPING_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as CheckedMap
  } catch {
    return {}
  }
}

function saveChecked(map: CheckedMap) {
  localStorage.setItem(SHOPPING_KEY, JSON.stringify(map))
}

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: "Verduras", keywords: ["tomate", "lechuga", "cebolla", "ajo", "pimiento", "calabacin", "calabacín", "zanahoria", "espinaca", "brocoli", "brócoli", "patata", "pepino", "berenjena", "champiñon", "champiñón", "puerro", "apio", "col", "judia", "judía", "esparrago", "espárrago", "rucula", "rúcula", "kale", "remolacha"] },
  { category: "Frutas", keywords: ["manzana", "platano", "plátano", "naranja", "fresa", "pera", "uva", "limon", "limón", "kiwi", "mango", "piña", "sandia", "sandía", "melon", "melón", "aguacate", "arandano", "arándano", "frambuesa", "cereza", "mandarina", "granada"] },
  { category: "Proteínas", keywords: ["pollo", "ternera", "cerdo", "pavo", "atun", "atún", "salmon", "salmón", "merluza", "bacalao", "huevo", "tofu", "tempeh", "lenteja", "garbanzo", "alubia", "judias blancas", "seitan", "seitán", "gambas", "marisco", "carne", "pescado", "jamon", "jamón"] },
  { category: "Lácteos", keywords: ["leche", "yogur", "queso", "mantequilla", "nata", "kefir", "kéfir", "requeson", "requesón", "cuajada"] },
  { category: "Cereales", keywords: ["arroz", "pasta", "pan", "avena", "quinoa", "cuscus", "cuscús", "trigo", "cebada", "espelta", "harina", "tortilla", "fideo", "macarron", "macarrón", "espagueti"] },
]

function categorize(name: string): string {
  const n = name.toLowerCase()
  for (const { category, keywords } of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => n.includes(k))) return category
  }
  return "Otros"
}

interface AggregatedItem {
  key: string
  name: string
  totalG: number
  category: string
}

function useWeekMealPlanItems(weekStart: Date) {
  const { user } = useAuth()
  const startStr = format(weekStart, "yyyy-MM-dd")
  const endStr = format(addDays(weekStart, 6), "yyyy-MM-dd")

  return useQuery({
    queryKey: ["shopping-list", user?.id, startStr],
    queryFn: async (): Promise<MealPlanItem[]> => {
      if (!user) return []
      const { data: plans, error: planError } = await supabase
        .from("meal_plans")
        .select("id")
        .eq("user_id", user.id)
        .gte("plan_date", startStr)
        .lte("plan_date", endStr)
      if (planError) throw planError
      const planIds = (plans as unknown as Array<Pick<MealPlan, "id">>).map((p) => p.id)
      if (!planIds.length) return []
      const { data: items, error: itemsError } = await supabase
        .from("meal_plan_items")
        .select("*")
        .in("meal_plan_id", planIds)
      if (itemsError) throw itemsError
      return (items || []) as unknown as MealPlanItem[]
    },
    enabled: !!user,
  })
}

export default function ShoppingListPage() {
  // Madrid week — date-fns uses local time which on the user device is fine.
  const weekStart = useMemo(() => startOfWeek(new Date(), { weekStartsOn: 1 }), [])
  const weekKey = format(weekStart, "yyyy-MM-dd")
  const { data: items, isLoading } = useWeekMealPlanItems(weekStart)

  const [checkedMap, setCheckedMap] = useState<CheckedMap>({})

  useEffect(() => {
    setCheckedMap(loadChecked())
  }, [])

  const aggregated: AggregatedItem[] = useMemo(() => {
    const map = new Map<string, AggregatedItem>()
    for (const item of items || []) {
      const ings = item.ingredients
      if (!Array.isArray(ings)) continue
      for (const raw of ings as Array<{ name?: string; quantity_g?: number }>) {
        if (!raw || typeof raw.name !== "string") continue
        const name = raw.name.trim()
        if (!name) continue
        const key = name.toLowerCase()
        const qty = typeof raw.quantity_g === "number" ? raw.quantity_g : 0
        const existing = map.get(key)
        if (existing) {
          existing.totalG += qty
        } else {
          map.set(key, { key, name, totalG: qty, category: categorize(name) })
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "es"))
  }, [items])

  const grouped = useMemo(() => {
    const g = new Map<string, AggregatedItem[]>()
    for (const it of aggregated) {
      const arr = g.get(it.category) || []
      arr.push(it)
      g.set(it.category, arr)
    }
    const order = ["Verduras", "Frutas", "Proteínas", "Lácteos", "Cereales", "Otros"]
    return order
      .filter((c) => g.has(c))
      .map((c) => ({ category: c, items: g.get(c)! }))
  }, [aggregated])

  const checkedForWeek = checkedMap[weekKey] || {}

  const toggle = (key: string) => {
    const next: CheckedMap = {
      ...checkedMap,
      [weekKey]: { ...checkedForWeek, [key]: !checkedForWeek[key] },
    }
    setCheckedMap(next)
    saveChecked(next)
  }

  const handleClear = () => {
    const next = { ...checkedMap, [weekKey]: {} }
    setCheckedMap(next)
    saveChecked(next)
    toast.success("Marcas eliminadas")
  }

  const handleShare = async () => {
    const lines: string[] = [`Lista de la compra · semana del ${format(weekStart, "d MMM", { locale: es })}`]
    for (const group of grouped) {
      lines.push("")
      lines.push(group.category.toUpperCase())
      for (const it of group.items) {
        const qty = it.totalG > 0 ? ` — ${Math.round(it.totalG)} g` : ""
        lines.push(`- ${it.name}${qty}`)
      }
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"))
      toast.success("Copiado")
    } catch {
      toast.error("No se pudo copiar")
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link to="/plan" className="inline-flex items-center text-sm text-primary">
          <ChevronLeft className="h-4 w-4" /> Volver al plan
        </Link>
        <p className="text-xs text-muted-foreground">
          Semana del {format(weekStart, "d 'de' MMM", { locale: es })}
        </p>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Lista de la compra</h1>
        <p className="text-sm text-muted-foreground">
          Ingredientes agregados de tu plan de la semana.
        </p>
      </div>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1" onClick={handleShare} disabled={!aggregated.length}>
          <Share2 className="h-4 w-4 mr-1" /> Compartir
        </Button>
        <Button variant="outline" size="sm" className="flex-1" onClick={handleClear}>
          <Eraser className="h-4 w-4 mr-1" /> Limpiar marcados
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !aggregated.length ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Aún no hay ingredientes. Genera el plan de la semana primero.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Card key={group.category}>
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-2">
                  {group.category}
                </p>
                <ul className="space-y-2">
                  {group.items.map((it) => {
                    const checked = !!checkedForWeek[it.key]
                    return (
                      <li key={it.key} className="flex items-center gap-3">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggle(it.key)}
                          id={`shop-${it.key}`}
                        />
                        <label
                          htmlFor={`shop-${it.key}`}
                          className={`flex-1 text-sm cursor-pointer ${checked ? "line-through text-muted-foreground" : ""}`}
                        >
                          {it.name}
                          {it.totalG > 0 && (
                            <span className="text-muted-foreground"> · {Math.round(it.totalG)} g</span>
                          )}
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
