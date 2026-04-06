import { useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { toast } from "sonner"
import { AlertTriangle, Loader2, Trash2, RotateCcw } from "lucide-react"
import { useNavigate } from "react-router-dom"

const TESTER_EMAIL = "oscarcorrochanolopez@gmail.com"

export function isTester(email: string | null | undefined): boolean {
  return email?.toLowerCase() === TESTER_EMAIL
}

type Action = {
  key: string
  label: string
  description: string
  run: (userId: string) => Promise<void>
}

export function TesterControls() {
  const { user, signOut } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<Action | null>(null)
  const [running, setRunning] = useState(false)

  if (!isTester(user?.email)) return null

  const deleteMealPlans = async (uid: string) => {
    const { error } = await supabase.from("meal_plans").delete().eq("user_id", uid)
    if (error) throw error
  }
  const deletePantry = async (uid: string) => {
    const { error } = await supabase.from("pantry_items").delete().eq("user_id", uid)
    if (error) throw error
  }
  const deleteFoodLog = async (uid: string) => {
    const { error } = await supabase.from("food_log").delete().eq("user_id", uid)
    if (error) throw error
  }
  const deleteWeightLog = async (uid: string) => {
    const { error } = await supabase.from("weight_log").delete().eq("user_id", uid)
    if (error) throw error
  }
  const deleteGoals = async (uid: string) => {
    const { error } = await supabase.from("user_goals").delete().eq("user_id", uid)
    if (error) throw error
  }
  const deletePreferences = async (uid: string) => {
    const { error: e1 } = await supabase.from("food_preferences").delete().eq("user_id", uid)
    if (e1) throw e1
    const { error: e2 } = await supabase.from("cuisine_preferences").delete().eq("user_id", uid)
    if (e2) throw e2
  }
  const resetProfile = async (uid: string) => {
    // Wipe profile fields and mark onboarding incomplete so wizard reruns
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: "",
        gender: null,
        birth_date: null,
        height_cm: null,
        weight_kg: null,
        activity_level: null,
        exercise_days_per_week: null,
        exercise_description: null,
        health_notes: null,
        meal_schedule: null,
        onboarding_completed: false,
      } as never)
      .eq("id", uid)
    if (error) throw error
  }

  const nukeEverything = async (uid: string) => {
    await deleteMealPlans(uid)
    await deletePantry(uid)
    await deleteFoodLog(uid)
    await deleteWeightLog(uid)
    await deleteGoals(uid)
    await deletePreferences(uid)
    await resetProfile(uid)
  }

  const actions: Action[] = [
    {
      key: "plans",
      label: "Borrar todos los planes",
      description: "Elimina todos los meal_plans y sus items.",
      run: deleteMealPlans,
    },
    {
      key: "pantry",
      label: "Vaciar despensa",
      description: "Elimina todos los alimentos de tu despensa.",
      run: deletePantry,
    },
    {
      key: "food_log",
      label: "Borrar registro de comidas",
      description: "Elimina todo el historial de comidas registradas.",
      run: deleteFoodLog,
    },
    {
      key: "weight",
      label: "Borrar registro de peso",
      description: "Elimina todas las mediciones de peso.",
      run: deleteWeightLog,
    },
    {
      key: "goals",
      label: "Borrar objetivos",
      description: "Elimina todos los objetivos nutricionales.",
      run: deleteGoals,
    },
    {
      key: "prefs",
      label: "Borrar preferencias",
      description: "Elimina preferencias alimentarias y de cocinas.",
      run: deletePreferences,
    },
    {
      key: "profile",
      label: "Reiniciar perfil (rehacer onboarding)",
      description: "Vacia el perfil y te lleva de nuevo al onboarding.",
      run: resetProfile,
    },
    {
      key: "nuke",
      label: "RESET TOTAL — borrar absolutamente todo",
      description: "Borra planes, despensa, log de comidas, peso, objetivos, preferencias y reinicia tu perfil.",
      run: nukeEverything,
    },
  ]

  const execute = async () => {
    if (!confirm || !user) return
    setRunning(true)
    try {
      await confirm.run(user.id)
      toast.success(`${confirm.label} completado`)
      await queryClient.invalidateQueries()
      if (confirm.key === "profile" || confirm.key === "nuke") {
        // Force sign-out and reload to ensure all state is clean
        setTimeout(async () => {
          await signOut()
          navigate("/auth", { replace: true })
        }, 400)
      }
      setConfirm(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error ejecutando accion")
    } finally {
      setRunning(false)
    }
  }

  return (
    <>
      <Card className="border-destructive/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Modo tester
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Controles de prueba visibles solo para tu cuenta. Todas las acciones son destructivas.
          </p>
          <div className="grid gap-2">
            {actions.map((a) => {
              const destructive = a.key === "nuke"
              return (
                <Button
                  key={a.key}
                  variant={destructive ? "destructive" : "outline"}
                  size="sm"
                  className="justify-start"
                  onClick={() => setConfirm(a)}
                >
                  {a.key === "profile" ? (
                    <RotateCcw className="h-4 w-4 mr-2" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  {a.label}
                </Button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!confirm} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar accion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="font-medium">{confirm?.label}</p>
            <p className="text-sm text-muted-foreground">{confirm?.description}</p>
            <p className="text-xs text-destructive">Esta accion no se puede deshacer.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirm(null)} disabled={running}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={execute} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : "Borrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
