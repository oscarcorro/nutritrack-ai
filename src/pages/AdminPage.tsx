import { useState } from "react"
import { useProfile } from "@/hooks/use-profile"
import { Navigate } from "react-router-dom"
import { supabase } from "@/integrations/supabase/client"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCalories, formatMacro } from "@/lib/nutrition"
import type { Profile, FoodLog, WeightLog, UserGoal } from "@/integrations/supabase/types"
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { Users, ChevronRight, ArrowLeft } from "lucide-react"
import { format, subDays } from "date-fns"
import { es } from "date-fns/locale"

function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  // Fetch user profile
  const { data: profile } = useQuery({
    queryKey: ["admin", "profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
      if (error) throw error
      return data as Profile
    },
  })

  // Fetch weight logs
  const { data: weightLogs } = useQuery({
    queryKey: ["admin", "weight", userId],
    queryFn: async () => {
      const startDate = subDays(new Date(), 30).toISOString()
      const { data, error } = await supabase
        .from("weight_log")
        .select("*")
        .eq("user_id", userId)
        .gte("measured_at", startDate)
        .order("measured_at", { ascending: true })
      if (error) throw error
      return data as WeightLog[]
    },
  })

  // Fetch recent food logs
  const { data: foodLogs } = useQuery({
    queryKey: ["admin", "food", userId],
    queryFn: async () => {
      const startDate = subDays(new Date(), 7).toISOString()
      const { data, error } = await supabase
        .from("food_log")
        .select("*")
        .eq("user_id", userId)
        .gte("logged_at", startDate)
        .order("logged_at", { ascending: false })
      if (error) throw error
      return data as FoodLog[]
    },
  })

  // Fetch goals
  const { data: goal } = useQuery({
    queryKey: ["admin", "goal", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_goals")
        .select("*")
        .eq("user_id", userId)
        .eq("is_current", true)
        .maybeSingle()
      if (error) throw error
      return data as UserGoal | null
    },
  })

  const weightChartData = (weightLogs || []).map((w) => ({
    date: format(new Date(w.measured_at), "dd/MM"),
    peso: w.weight_kg,
  }))

  // Calorie by day
  const calorieByDay: Record<string, number> = {}
  for (let i = 6; i >= 0; i--) {
    calorieByDay[format(subDays(new Date(), i), "yyyy-MM-dd")] = 0
  }
  ;(foodLogs || []).forEach((log) => {
    const d = log.logged_at.split("T")[0]
    if (calorieByDay[d] !== undefined) {
      calorieByDay[d] += log.calories || 0
    }
  })
  const calorieChartData = Object.entries(calorieByDay).map(([date, cal]) => ({
    date: format(new Date(date), "EEE", { locale: es }),
    calorias: Math.round(cal),
  }))

  return (
    <div className="space-y-4">
      <Button variant="ghost" onClick={onBack} className="gap-1">
        <ArrowLeft className="h-5 w-5" /> Volver
      </Button>

      <h3 className="text-xl font-bold">{profile?.display_name || "Usuario"}</h3>

      {goal && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Objetivo actual</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-base">{formatCalories(goal.daily_calories_target)} / dia</p>
            <p className="text-sm text-muted-foreground">
              P: {formatMacro(goal.protein_g)} | C: {formatMacro(goal.carbs_g)} | G: {formatMacro(goal.fat_g)}
            </p>
          </CardContent>
        </Card>
      )}

      {weightChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Peso</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={weightChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis domain={["dataMin - 2", "dataMax + 2"]} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="peso" stroke="#16a34a" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Calorías (7 días)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={calorieChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="calorias" fill="#16a34a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {foodLogs && foodLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Registros recientes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {foodLogs.slice(0, 10).map((log) => (
              <div key={log.id} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div>
                  <p className="font-medium text-sm">{log.meal_name}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(log.logged_at), "dd/MM HH:mm")}</p>
                </div>
                <Badge variant="outline" className="text-xs">{log.calories ? formatCalories(log.calories) : "--"}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function AdminPage() {
  const { data: profile, isLoading } = useProfile()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)

  // Fetch all users
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("role", "user")
        .order("display_name", { ascending: true })
      if (error) throw error
      return data as Profile[]
    },
    enabled: profile?.role === "admin",
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  if (profile?.role !== "admin") {
    return <Navigate to="/inicio" replace />
  }

  if (selectedUserId) {
    return <UserDetail userId={selectedUserId} onBack={() => setSelectedUserId(null)} />
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Users className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-bold">Panel de administracion</h2>
      </div>

      {usersLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : users && users.length > 0 ? (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedUserId(u.id)}>
              <CardContent className="flex items-center justify-between p-4">
                <div>
                  <p className="font-semibold">{u.display_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {u.onboarding_completed ? "Activo" : "Sin completar onboarding"}
                  </p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="text-center text-muted-foreground py-8">No hay usuarios registrados.</p>
      )}
    </div>
  )
}
