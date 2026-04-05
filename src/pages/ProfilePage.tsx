import { useState } from "react"
import { useProfile, useUpdateProfile } from "@/hooks/use-profile"
import { useCurrentGoal } from "@/hooks/use-goals"
import { useFoodPreferences, useDeleteFoodPreference } from "@/hooks/use-food-preferences"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { ACTIVITY_LABELS, calculateAge, formatCalories, formatMacro } from "@/lib/nutrition"
import type { ActivityLevel } from "@/integrations/supabase/types"
import { User, Pencil, LogOut, Loader2, X, Ruler, Weight, Calendar } from "lucide-react"
import { useNavigate } from "react-router-dom"

const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Perder grasa",
  maintain: "Mantener peso",
  gain_muscle: "Ganar musculo",
}

export default function ProfilePage() {
  const { signOut } = useAuth()
  const navigate = useNavigate()
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: goal } = useCurrentGoal()
  const { data: foodPrefs } = useFoodPreferences()
  const updateProfile = useUpdateProfile()
  const deletePref = useDeleteFoodPreference()

  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editHeight, setEditHeight] = useState("")
  const [editWeight, setEditWeight] = useState("")
  const [editActivity, setEditActivity] = useState<ActivityLevel | "">("")
  const [saving, setSaving] = useState(false)

  const openEdit = () => {
    if (!profile) return
    setEditName(profile.display_name || "")
    setEditHeight(profile.height_cm?.toString() || "")
    setEditWeight(profile.weight_kg?.toString() || "")
    setEditActivity(profile.activity_level || "")
    setEditOpen(true)
  }

  const handleSaveEdit = async () => {
    if (!editName) {
      toast.error("El nombre es obligatorio")
      return
    }
    setSaving(true)
    try {
      await updateProfile.mutateAsync({
        display_name: editName,
        height_cm: parseFloat(editHeight) || null,
        weight_kg: parseFloat(editWeight) || null,
        activity_level: editActivity as ActivityLevel || null,
      })
      toast.success("Perfil actualizado")
      setEditOpen(false)
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  const handleDeletePref = async (id: string) => {
    try {
      await deletePref.mutateAsync(id)
      toast.success("Preferencia eliminada")
    } catch {
      toast.error("Error al eliminar")
    }
  }

  const handleSignOut = async () => {
    await signOut()
    navigate("/auth", { replace: true })
  }

  if (profileLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  if (!profile) return null

  const age = profile.birth_date ? calculateAge(profile.birth_date) : null

  return (
    <div className="space-y-5">
      <h2 className="text-2xl font-bold">Mi perfil</h2>

      {/* Profile info */}
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-14 h-14 rounded-full bg-primary/10">
                <User className="h-7 w-7 text-primary" />
              </div>
              <div>
                <p className="text-xl font-bold">{profile.display_name}</p>
                <p className="text-sm text-muted-foreground">{profile.gender === "male" ? "Hombre" : "Mujer"}{age ? `, ${age} anos` : ""}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={openEdit}>
              <Pencil className="h-5 w-5" />
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col items-center p-3 rounded-xl bg-secondary">
              <Ruler className="h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{profile.height_cm || "--"}</p>
              <p className="text-xs text-muted-foreground">cm</p>
            </div>
            <div className="flex flex-col items-center p-3 rounded-xl bg-secondary">
              <Weight className="h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{profile.weight_kg || "--"}</p>
              <p className="text-xs text-muted-foreground">kg</p>
            </div>
            <div className="flex flex-col items-center p-3 rounded-xl bg-secondary">
              <Calendar className="h-5 w-5 text-muted-foreground mb-1" />
              <p className="text-lg font-bold">{profile.exercise_days_per_week ?? "--"}</p>
              <p className="text-xs text-muted-foreground">dias/sem</p>
            </div>
          </div>

          {profile.activity_level && (
            <p className="text-sm text-muted-foreground mt-3">
              Nivel: {ACTIVITY_LABELS[profile.activity_level]}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current goal */}
      {goal && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Objetivo actual</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge variant="success" className="text-sm">{GOAL_LABELS[goal.goal_type] || goal.goal_type}</Badge>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p className="text-sm text-muted-foreground">Calorias/dia</p>
                <p className="text-lg font-bold">{formatCalories(goal.daily_calories_target)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Peso objetivo</p>
                <p className="text-lg font-bold">{goal.target_weight_kg} kg</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="text-center p-2 rounded-lg bg-blue-50">
                <p className="text-xs text-muted-foreground">Prot</p>
                <p className="font-bold text-blue-700">{formatMacro(goal.protein_g)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-amber-50">
                <p className="text-xs text-muted-foreground">Carbs</p>
                <p className="font-bold text-amber-700">{formatMacro(goal.carbs_g)}</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-rose-50">
                <p className="text-xs text-muted-foreground">Grasa</p>
                <p className="font-bold text-rose-700">{formatMacro(goal.fat_g)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Food preferences */}
      {foodPrefs && foodPrefs.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Preferencias alimentarias</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {foodPrefs.map((pref) => {
                const variantMap: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
                  like: "success",
                  dislike: "destructive",
                  allergy: "warning",
                  intolerance: "secondary",
                }
                return (
                  <Badge key={pref.id} variant={variantMap[pref.preference_type] || "secondary"} className="gap-1 py-1.5 px-3">
                    {pref.food_name}
                    <button onClick={() => handleDeletePref(pref.id)} aria-label="Eliminar">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sign out */}
      <Button variant="outline" size="lg" className="w-full text-destructive border-destructive/30" onClick={handleSignOut}>
        <LogOut className="h-5 w-5 mr-2" />
        Cerrar sesion
      </Button>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input type="number" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nivel de actividad</Label>
              <Select value={editActivity} onValueChange={(v) => setEditActivity(v as ActivityLevel)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
