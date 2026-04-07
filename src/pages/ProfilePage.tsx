import { useEffect, useRef, useState, useMemo } from "react"
import { Switch } from "@/components/ui/switch"
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  initReminders,
  cancelReminders,
  requestNotificationPermission,
  type NotificationPrefs,
} from "@/lib/notifications"
import { useTheme, type ThemeMode } from "@/hooks/use-theme"
import { supabase } from "@/integrations/supabase/client"
import { useProfile, useUpdateProfile } from "@/hooks/use-profile"
import { useCurrentGoal, useCreateGoal } from "@/hooks/use-goals"
import { useFoodPreferences, useDeleteFoodPreference } from "@/hooks/use-food-preferences"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import {
  ACTIVITY_LABELS,
  calculateAge,
  formatCalories,
  formatMacro,
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculateMacros,
  INTENSITY_LABELS,
  describeIntensity,
} from "@/lib/nutrition"
import type { ActivityLevel, Gender, GoalType, GoalIntensity, MealType } from "@/integrations/supabase/types"
import { User, Pencil, LogOut, Loader2, X, Ruler, Weight, Calendar, Target } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { PantrySection } from "@/components/pantry/PantrySection"
import { TesterControls } from "@/components/admin/TesterControls"
import { openGuidedTour } from "@/components/onboarding/GuidedTour"
import { HelpCircle, ChefHat } from "lucide-react"

const GOAL_LABELS: Record<GoalType, string> = {
  lose_weight: "Perder grasa",
  maintain: "Mantener peso",
  gain_muscle: "Ganar músculo",
}

const MEAL_SCHEDULE_LABELS: Record<MealType, string> = {
  breakfast: "Desayuno",
  morning_snack: "Media mañana",
  lunch: "Comida",
  afternoon_snack: "Merienda",
  dinner: "Cena",
}
const DEFAULT_MEAL_TIMES: Record<MealType, string> = {
  breakfast: "08:00",
  morning_snack: "11:00",
  lunch: "14:00",
  afternoon_snack: "17:30",
  dinner: "20:30",
}

export default function ProfilePage() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const { data: profile, isLoading: profileLoading } = useProfile()
  const { data: goal } = useCurrentGoal()
  const { data: foodPrefs } = useFoodPreferences()
  const updateProfile = useUpdateProfile()
  const createGoal = useCreateGoal()
  const deletePref = useDeleteFoodPreference()

  // --- Profile edit dialog ---
  const [editOpen, setEditOpen] = useState(false)
  const [editName, setEditName] = useState("")
  const [editGender, setEditGender] = useState<Gender | "">("")
  const [editBirthDate, setEditBirthDate] = useState("")
  const [editHeight, setEditHeight] = useState("")
  const [editWeight, setEditWeight] = useState("")
  const [editActivity, setEditActivity] = useState<ActivityLevel | "">("")
  const [editExerciseDays, setEditExerciseDays] = useState("")
  const [editExerciseDesc, setEditExerciseDesc] = useState("")
  const [editHealthNotes, setEditHealthNotes] = useState("")
  const [editMealSchedule, setEditMealSchedule] = useState<Record<MealType, string>>(DEFAULT_MEAL_TIMES)
  const [saving, setSaving] = useState(false)

  const openEdit = () => {
    if (!profile) return
    setEditName(profile.display_name || "")
    setEditGender(profile.gender || "")
    setEditBirthDate(profile.birth_date || "")
    setEditHeight(profile.height_cm?.toString() || "")
    setEditWeight(profile.weight_kg?.toString() || "")
    setEditActivity(profile.activity_level || "")
    setEditExerciseDays(profile.exercise_days_per_week?.toString() || "")
    setEditExerciseDesc(profile.exercise_description || "")
    setEditHealthNotes(profile.health_notes || "")
    setEditMealSchedule({ ...DEFAULT_MEAL_TIMES, ...(profile.meal_schedule || {}) } as Record<MealType, string>)
    setEditOpen(true)
  }

  // Live preview: recompute calorie target from edited fields + current goal's deficit
  const previewCalories = useMemo(() => {
    const w = parseFloat(editWeight)
    const h = parseFloat(editHeight)
    if (!w || !h || !editBirthDate || !editGender || !editActivity) return null
    const age = calculateAge(editBirthDate)
    if (!age || age <= 0) return null
    const bmr = calculateBMR(w, h, age, editGender as Gender)
    const tdee = calculateTDEE(bmr, editActivity as ActivityLevel)
    const gType = (goal?.goal_type as GoalType) || "maintain"
    const intensity = (goal?.intensity as GoalIntensity) || "moderate"
    return calculateCalorieTarget(tdee, gType, intensity, editGender as Gender)
  }, [editWeight, editHeight, editBirthDate, editGender, editActivity, goal?.goal_type, goal?.intensity])

  const handleSaveEdit = async () => {
    if (!editName) {
      toast.error("El nombre es obligatorio")
      return
    }
    setSaving(true)
    try {
      await updateProfile.mutateAsync({
        display_name: editName,
        gender: (editGender || null) as Gender | null,
        birth_date: editBirthDate || null,
        height_cm: parseFloat(editHeight) || null,
        weight_kg: parseFloat(editWeight) || null,
        activity_level: (editActivity || null) as ActivityLevel | null,
        exercise_days_per_week: parseInt(editExerciseDays) || null,
        exercise_description: editExerciseDesc || null,
        health_notes: editHealthNotes || null,
        meal_schedule: editMealSchedule,
      })
      toast.success("Perfil actualizado")
      setEditOpen(false)
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  // --- Goal edit dialog ---
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalType, setGoalType] = useState<GoalType>("lose_weight")
  const [goalIntensity, setGoalIntensity] = useState<GoalIntensity>("moderate")
  const [goalStartWeight, setGoalStartWeight] = useState("")
  const [goalTargetWeight, setGoalTargetWeight] = useState("")
  const [goalCalories, setGoalCalories] = useState("")
  const [goalProtein, setGoalProtein] = useState("")
  const [goalCarbs, setGoalCarbs] = useState("")
  const [goalFat, setGoalFat] = useState("")
  const [goalMeals, setGoalMeals] = useState("5")
  const [savingGoal, setSavingGoal] = useState(false)

  const openGoal = () => {
    setGoalType((goal?.goal_type as GoalType) || "lose_weight")
    setGoalIntensity((goal?.intensity as GoalIntensity) || "moderate")
    setGoalStartWeight(goal?.starting_weight_kg?.toString() || profile?.weight_kg?.toString() || "")
    setGoalTargetWeight(goal?.target_weight_kg?.toString() || "")
    setGoalCalories(goal?.daily_calories_target?.toString() || "")
    setGoalProtein(goal?.protein_g?.toString() || "")
    setGoalCarbs(goal?.carbs_g?.toString() || "")
    setGoalFat(goal?.fat_g?.toString() || "")
    setGoalMeals(goal?.meals_per_day?.toString() || "5")
    setGoalOpen(true)
  }

  const recalculateFromProfile = () => {
    if (!profile?.weight_kg || !profile?.height_cm || !profile?.birth_date || !profile?.gender || !profile?.activity_level) {
      toast.error("Completa peso, altura, fecha de nacimiento, genero y nivel de actividad en el perfil")
      return
    }
    const age = calculateAge(profile.birth_date)
    const bmr = calculateBMR(profile.weight_kg, profile.height_cm, age, profile.gender)
    const tdee = calculateTDEE(bmr, profile.activity_level)
    const cals = calculateCalorieTarget(tdee, goalType, goalIntensity, profile.gender)
    const macros = calculateMacros(cals, goalType, profile.weight_kg)
    setGoalCalories(cals.toString())
    setGoalProtein(macros.protein_g.toString())
    setGoalCarbs(macros.carbs_g.toString())
    setGoalFat(macros.fat_g.toString())
    toast.success("Macros recalculados")
  }

  const handleSaveGoal = async () => {
    const cals = parseFloat(goalCalories)
    const startW = parseFloat(goalStartWeight)
    const targetW = parseFloat(goalTargetWeight)
    if (!cals || !startW || !targetW) {
      toast.error("Completa peso actual, objetivo y calorías")
      return
    }
    setSavingGoal(true)
    try {
      await createGoal.mutateAsync({
        starting_weight_kg: startW,
        target_weight_kg: targetW,
        ideal_weight_kg: null,
        daily_calories_target: cals,
        protein_g: parseFloat(goalProtein) || 0,
        carbs_g: parseFloat(goalCarbs) || 0,
        fat_g: parseFloat(goalFat) || 0,
        fiber_g: 25,
        meals_per_day: parseInt(goalMeals) || 5,
        goal_type: goalType,
        intensity: goalIntensity,
        is_current: true,
        notes: null,
      })
      toast.success("Objetivo actualizado")
      setGoalOpen(false)
    } catch {
      toast.error("Error al guardar objetivo")
    } finally {
      setSavingGoal(false)
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

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error("La imagen es demasiado grande (max 5MB)")
      return
    }
    setUploadingAvatar(true)
    try {
      const ext = file.name.split(".").pop() || "jpg"
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path)
      await updateProfile.mutateAsync({ avatar_url: pub.publicUrl })
      toast.success("Foto actualizada")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir foto")
    } finally {
      setUploadingAvatar(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ""
    }
  }

  const initials = (profile?.display_name || "?")
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()

  // --- Notifications settings ---
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(() => loadNotificationPrefs())
  useEffect(() => {
    saveNotificationPrefs(notifPrefs)
    if (notifPrefs.enabled) initReminders()
    else cancelReminders()
  }, [notifPrefs])

  const handleToggleEnabled = async (next: boolean) => {
    if (next) {
      const perm = await requestNotificationPermission()
      if (perm !== "granted") {
        toast.error("Permiso denegado en el navegador")
        return
      }
    }
    setNotifPrefs((p) => ({ ...p, enabled: next }))
  }

  // --- Theme ---
  const { theme, setTheme } = useTheme()

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
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Cambiar foto de perfil"
                className="relative flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 overflow-hidden border border-border/60"
              >
                {profile.avatar_url ? (
                  <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : initials ? (
                  <span className="text-xl font-bold text-primary">{initials}</span>
                ) : (
                  <User className="h-8 w-8 text-primary" />
                )}
                {uploadingAvatar && (
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Loader2 className="h-5 w-5 text-white animate-spin" />
                  </span>
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarSelect}
              />
              <div>
                <p className="text-xl font-bold">{profile.display_name}</p>
                <p className="text-sm text-muted-foreground">
                  {profile.gender === "male" ? "Hombre" : profile.gender === "female" ? "Mujer" : "-"}
                  {age ? `, ${age} años` : ""}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={openEdit} aria-label="Editar perfil">
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
              <p className="text-xs text-muted-foreground">días/sem</p>
            </div>
          </div>

          {profile.activity_level && (
            <p className="text-sm text-muted-foreground mt-3">
              Nivel: {ACTIVITY_LABELS[profile.activity_level]}
            </p>
          )}
          {profile.health_notes && (
            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">
              <span className="font-medium">Notas:</span> {profile.health_notes}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Current goal */}
      <Card data-tour="goals">
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Objetivo actual</CardTitle>
          <Button variant="ghost" size="icon" onClick={openGoal} aria-label="Editar objetivo">
            <Pencil className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {goal ? (
            <>
              <Badge variant="success" className="text-sm">{GOAL_LABELS[goal.goal_type as GoalType] || goal.goal_type}</Badge>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <p className="text-sm text-muted-foreground">Calorías/día</p>
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
            </>
          ) : (
            <div className="text-center py-4 space-y-3">
              <Target className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aun no tienes un objetivo definido</p>
              <Button onClick={openGoal} size="sm">Crear objetivo</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pantry */}
      <div data-tour="pantry">
        <PantrySection />
      </div>

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

      {/* My recipes */}
      <Button variant="outline" size="lg" className="w-full" onClick={() => navigate("/recetas")}>
        <ChefHat className="h-5 w-5 mr-2" />
        Mis recetas
      </Button>

      {/* App tour */}
      <Button variant="outline" size="lg" className="w-full" onClick={() => openGuidedTour()}>
        <HelpCircle className="h-5 w-5 mr-2" />
        Ver guia de la app
      </Button>

      {/* Notifications settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Recordatorios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Activar recordatorios</p>
              <p className="text-xs text-muted-foreground">Avisos locales en este dispositivo</p>
            </div>
            <Switch
              checked={notifPrefs.enabled}
              onCheckedChange={handleToggleEnabled}
              aria-label="Activar recordatorios"
            />
          </div>
          <div className={`flex items-center justify-between ${!notifPrefs.enabled ? "opacity-50" : ""}`}>
            <p className="text-sm">Comidas</p>
            <Switch
              checked={notifPrefs.meals}
              disabled={!notifPrefs.enabled}
              onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, meals: v }))}
              aria-label="Recordatorios de comidas"
            />
          </div>
          <div className={`flex items-center justify-between ${!notifPrefs.enabled ? "opacity-50" : ""}`}>
            <p className="text-sm">Peso por la mañana</p>
            <Switch
              checked={notifPrefs.weighIn}
              disabled={!notifPrefs.enabled}
              onCheckedChange={(v) => setNotifPrefs((p) => ({ ...p, weighIn: v }))}
              aria-label="Recordatorio de peso por la mañana"
            />
          </div>
        </CardContent>
      </Card>

      {/* Theme settings */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tema</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(["light", "dark", "system"] as ThemeMode[]).map((mode) => {
              const labels: Record<ThemeMode, string> = {
                light: "Claro",
                dark: "Oscuro",
                system: "Sistema",
              }
              const active = theme === mode
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTheme(mode)}
                  aria-pressed={active}
                  className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                    active
                      ? "border-primary border-2 bg-accent text-primary"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  {labels[mode]}
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Tester-only admin controls */}
      <TesterControls />

      {/* Sign out */}
      <Button variant="outline" size="lg" className="w-full text-destructive border-destructive/30" onClick={handleSignOut}>
        <LogOut className="h-5 w-5 mr-2" />
        Cerrar sesion
      </Button>

      {/* Version badge */}
      <p className="text-center text-[11px] text-muted-foreground tabular-nums">
        v{__APP_VERSION__} · {__APP_BUILD_TIME__}
      </p>

      {/* Edit profile dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar perfil</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input aria-label="Nombre" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Genero</Label>
                <Select value={editGender} onValueChange={(v) => setEditGender(v as Gender)}>
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Hombre</SelectItem>
                    <SelectItem value="female">Mujer</SelectItem>
                    <SelectItem value="other">Otro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Fecha de nacimiento</Label>
                <Input aria-label="Fecha de nacimiento" type="date" value={editBirthDate} onChange={(e) => setEditBirthDate(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Altura (cm)</Label>
                <Input aria-label="Altura en centímetros" type="number" value={editHeight} onChange={(e) => setEditHeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Peso (kg)</Label>
                <Input aria-label="Peso en kilogramos" type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Nivel de actividad</Label>
              <Select value={editActivity} onValueChange={(v) => setEditActivity(v as ActivityLevel)}>
                <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                <SelectContent>
                  {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Días de ejercicio/semana</Label>
                <Input aria-label="Días de ejercicio por semana" type="number" min="0" max="7" value={editExerciseDays} onChange={(e) => setEditExerciseDays(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Tipo de ejercicio</Label>
                <Input aria-label="Tipo de ejercicio" value={editExerciseDesc} onChange={(e) => setEditExerciseDesc(e.target.value)} placeholder="Ej: caminar, pesas" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Horarios de comidas</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(MEAL_SCHEDULE_LABELS) as MealType[]).map((mt) => (
                  <div key={mt} className="space-y-1">
                    <p className="text-xs text-muted-foreground">{MEAL_SCHEDULE_LABELS[mt]}</p>
                    <Input
                      aria-label={`Hora de ${MEAL_SCHEDULE_LABELS[mt]}`}
                      type="time"
                      value={editMealSchedule[mt] || ""}
                      onChange={(e) => setEditMealSchedule((s) => ({ ...s, [mt]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
            </div>
            {previewCalories !== null && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                <p className="text-sm text-muted-foreground">Nuevo objetivo estimado</p>
                <p className="text-lg font-bold text-primary">Nuevo objetivo: {previewCalories} kcal/día</p>
                <p className="text-xs text-muted-foreground">Se aplicará al guardar (revisa también el objetivo).</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Notas de salud / dieta</Label>
              <Textarea
                aria-label="Notas de salud y dieta"
                value={editHealthNotes}
                onChange={(e) => setEditHealthNotes(e.target.value)}
                placeholder="Alergias, intolerancias, condiciones medicas, preferencias dieteticas..."
                rows={3}
              />
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

      {/* Edit goal dialog */}
      <Dialog open={goalOpen} onOpenChange={setGoalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar objetivo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de objetivo</Label>
              <Select value={goalType} onValueChange={(v) => setGoalType(v as GoalType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="lose_weight">Perder grasa</SelectItem>
                  <SelectItem value="maintain">Mantener peso</SelectItem>
                  <SelectItem value="gain_muscle">Ganar músculo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {goalType !== "maintain" && (
              <div className="space-y-2">
                <Label>Intensidad del {goalType === "lose_weight" ? "déficit" : "superávit"}</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["light", "moderate", "aggressive"] as GoalIntensity[]).map((lvl) => (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setGoalIntensity(lvl)}
                      className={`py-2.5 rounded-lg border text-sm font-semibold transition-all ${
                        goalIntensity === lvl
                          ? "border-primary border-2 bg-accent text-primary"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {INTENSITY_LABELS[lvl]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {describeIntensity(goalType, goalIntensity)}
                </p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Peso actual (kg)</Label>
                <Input aria-label="Peso actual en kilogramos" type="number" value={goalStartWeight} onChange={(e) => setGoalStartWeight(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Peso objetivo (kg)</Label>
                <Input aria-label="Peso objetivo en kilogramos" type="number" value={goalTargetWeight} onChange={(e) => setGoalTargetWeight(e.target.value)} />
              </div>
            </div>

            <Button type="button" variant="outline" size="sm" onClick={recalculateFromProfile} className="w-full">
              Recalcular calorías y macros
            </Button>

            <div className="space-y-2">
              <Label>Calorías/día</Label>
              <Input aria-label="Calorías por día" type="number" value={goalCalories} onChange={(e) => setGoalCalories(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Proteína (g)</Label>
                <Input aria-label="Proteína en gramos" type="number" value={goalProtein} onChange={(e) => setGoalProtein(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Carbos (g)</Label>
                <Input aria-label="Carbohidratos en gramos" type="number" value={goalCarbs} onChange={(e) => setGoalCarbs(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Grasa (g)</Label>
                <Input aria-label="Grasa en gramos" type="number" value={goalFat} onChange={(e) => setGoalFat(e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Comidas al dia</Label>
              <Input aria-label="Comidas al día" type="number" min="3" max="6" value={goalMeals} onChange={(e) => setGoalMeals(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGoalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveGoal} disabled={savingGoal}>
              {savingGoal ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
