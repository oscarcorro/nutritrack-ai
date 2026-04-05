import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { useUpdateProfile } from "@/hooks/use-profile"
import { useCreateGoal } from "@/hooks/use-goals"
import { useCreateFoodPreference, useUpsertCuisinePreference } from "@/hooks/use-food-preferences"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import {
  ACTIVITY_LABELS,
  calculateAge,
  calculateBMR,
  calculateTDEE,
  calculateCalorieTarget,
  calculateMacros,
  calculateBMI,
  getBMICategory,
  calculateIdealWeight,
  formatCalories,
  formatMacro,
} from "@/lib/nutrition"
import type { ActivityLevel, Gender, GoalType, PreferenceType } from "@/integrations/supabase/types"
import { ChevronLeft, ChevronRight, Loader2, Target, Scale, Dumbbell, X } from "lucide-react"

const CUISINES = [
  "Mediterranea",
  "Asiatica",
  "Mexicana",
  "Americana",
  "Casera espanola",
  "Internacional",
]

type FoodTag = { name: string; type: PreferenceType }

export default function OnboardingPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const updateProfile = useUpdateProfile()
  const createGoal = useCreateGoal()
  const createFoodPref = useCreateFoodPreference()
  const upsertCuisine = useUpsertCuisinePreference()

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1
  const [name, setName] = useState("")
  const [gender, setGender] = useState<Gender | "">("")
  const [birthDate, setBirthDate] = useState("")
  const [heightCm, setHeightCm] = useState("")
  const [weightKg, setWeightKg] = useState("")
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | "">("")

  // Step 2
  const [goalType, setGoalType] = useState<GoalType | "">("")
  const [exerciseDays, setExerciseDays] = useState(3)
  const [exerciseDesc, setExerciseDesc] = useState("")
  const [healthNotes, setHealthNotes] = useState("")

  // Step 3
  const [foodInput, setFoodInput] = useState("")
  const [foodTagType, setFoodTagType] = useState<PreferenceType>("like")
  const [foodTags, setFoodTags] = useState<FoodTag[]>([])
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>([])
  const [dietNotes, setDietNotes] = useState("")

  const totalSteps = 4
  const progressPercent = (step / totalSteps) * 100

  // Calculations for step 4
  const numWeight = parseFloat(weightKg)
  const numHeight = parseFloat(heightCm)
  const age = birthDate ? calculateAge(birthDate) : 0
  const bmi = numWeight && numHeight ? calculateBMI(numWeight, numHeight) : 0
  const idealWeight = numHeight && gender ? calculateIdealWeight(numHeight, gender as Gender) : 0
  const bmr = numWeight && numHeight && age && gender ? calculateBMR(numWeight, numHeight, age, gender as Gender) : 0
  const tdee = bmr && activityLevel ? calculateTDEE(bmr, activityLevel as ActivityLevel) : 0
  const calorieTarget = tdee && goalType ? calculateCalorieTarget(tdee, goalType as GoalType) : 0
  const macros = calorieTarget && goalType ? calculateMacros(calorieTarget, goalType as GoalType) : null

  const addFoodTag = () => {
    const trimmed = foodInput.trim()
    if (!trimmed) return
    if (foodTags.some((t) => t.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Ya agregaste este alimento")
      return
    }
    setFoodTags([...foodTags, { name: trimmed, type: foodTagType }])
    setFoodInput("")
  }

  const removeFoodTag = (index: number) => {
    setFoodTags(foodTags.filter((_, i) => i !== index))
  }

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    )
  }

  const validateStep = () => {
    if (step === 1) {
      if (!name || !gender || !birthDate || !heightCm || !weightKg || !activityLevel) {
        toast.error("Completa todos los campos")
        return false
      }
      if (parseFloat(heightCm) < 100 || parseFloat(heightCm) > 250) {
        toast.error("Altura debe estar entre 100 y 250 cm")
        return false
      }
      if (parseFloat(weightKg) < 30 || parseFloat(weightKg) > 300) {
        toast.error("Peso debe estar entre 30 y 300 kg")
        return false
      }
    }
    if (step === 2 && !goalType) {
      toast.error("Selecciona un objetivo")
      return false
    }
    return true
  }

  const nextStep = () => {
    if (validateStep()) setStep(step + 1)
  }

  const prevStep = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleFinish = async () => {
    if (!user) return
    setSaving(true)
    try {
      // Save profile
      await updateProfile.mutateAsync({
        display_name: name,
        gender: gender as Gender,
        birth_date: birthDate,
        height_cm: numHeight,
        weight_kg: numWeight,
        activity_level: activityLevel as ActivityLevel,
        exercise_days_per_week: exerciseDays,
        exercise_description: exerciseDesc || null,
        health_notes: healthNotes || null,
        onboarding_completed: true,
      })

      // Save goals
      await createGoal.mutateAsync({
        starting_weight_kg: numWeight,
        target_weight_kg: goalType === "lose_weight" ? idealWeight : goalType === "gain_muscle" ? numWeight + 5 : numWeight,
        ideal_weight_kg: idealWeight,
        daily_calories_target: calorieTarget,
        protein_g: macros!.protein_g,
        carbs_g: macros!.carbs_g,
        fat_g: macros!.fat_g,
        fiber_g: macros!.fiber_g,
        meals_per_day: 5,
        goal_type: goalType as GoalType,
        is_current: true,
        notes: null,
      })

      // Save food preferences
      for (const tag of foodTags) {
        await createFoodPref.mutateAsync({
          food_name: tag.name,
          preference_type: tag.type,
        })
      }

      // Save cuisine preferences
      for (const cuisine of CUISINES) {
        await upsertCuisine.mutateAsync({
          cuisine_name: cuisine,
          is_preferred: selectedCuisines.includes(cuisine),
        })
      }

      toast.success("Perfil configurado correctamente")
      navigate("/inicio", { replace: true })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error desconocido"
      toast.error("Error al guardar: " + message)
    } finally {
      setSaving(false)
    }
  }

  const goalOptions: { type: GoalType; icon: React.ReactNode; title: string; desc: string }[] = [
    { type: "lose_weight", icon: <Target className="h-8 w-8" />, title: "Perder grasa", desc: "Deficit calorico controlado" },
    { type: "maintain", icon: <Scale className="h-8 w-8" />, title: "Mantener peso", desc: "Mantener tu composicion actual" },
    { type: "gain_muscle", icon: <Dumbbell className="h-8 w-8" />, title: "Ganar musculo", desc: "Superavit calorico moderado" },
  ]

  const tagColors: Record<PreferenceType, "success" | "destructive" | "warning" | "secondary"> = {
    like: "success",
    dislike: "destructive",
    allergy: "warning",
    intolerance: "secondary",
  }

  const tagLabels: Record<PreferenceType, string> = {
    like: "Me gusta",
    dislike: "No me gusta",
    allergy: "Alergia",
    intolerance: "Intolerancia",
  }

  return (
    <div className="flex flex-col min-h-svh bg-background max-w-lg mx-auto px-4 py-6">
      {/* Progress */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-base font-medium text-muted-foreground">Paso {step} de {totalSteps}</span>
        </div>
        <Progress value={progressPercent} />
      </div>

      {/* Step 1: Personal data */}
      {step === 1 && (
        <div className="space-y-5 flex-1">
          <h2 className="text-2xl font-bold">Datos personales</h2>
          <div className="space-y-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" placeholder="Tu nombre" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Genero</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={gender === "male" ? "default" : "outline"}
                size="lg"
                className="text-lg"
                onClick={() => setGender("male")}
              >
                Hombre
              </Button>
              <Button
                type="button"
                variant={gender === "female" ? "default" : "outline"}
                size="lg"
                className="text-lg"
                onClick={() => setGender("female")}
              >
                Mujer
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="birth">Fecha de nacimiento</Label>
            <Input id="birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="height">Altura (cm)</Label>
              <Input id="height" type="number" placeholder="175" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weight">Peso (kg)</Label>
              <Input id="weight" type="number" placeholder="80" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Nivel de actividad</Label>
            <Select value={activityLevel} onValueChange={(v) => setActivityLevel(v as ActivityLevel)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona tu nivel" />
              </SelectTrigger>
              <SelectContent>
                {(Object.entries(ACTIVITY_LABELS) as [ActivityLevel, string][]).map(([key, label]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Step 2: Goal */}
      {step === 2 && (
        <div className="space-y-5 flex-1">
          <h2 className="text-2xl font-bold">Tu objetivo</h2>
          <div className="space-y-3">
            {goalOptions.map((opt) => (
              <Card
                key={opt.type}
                className={`cursor-pointer transition-all ${goalType === opt.type ? "border-primary border-2 bg-accent" : "hover:border-primary/50"}`}
                onClick={() => setGoalType(opt.type)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className={`flex items-center justify-center w-14 h-14 rounded-xl ${goalType === opt.type ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground"}`}>
                    {opt.icon}
                  </div>
                  <div>
                    <p className="text-lg font-semibold">{opt.title}</p>
                    <p className="text-sm text-muted-foreground">{opt.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="space-y-2">
            <Label>Dias de ejercicio por semana: {exerciseDays}</Label>
            <Slider
              value={[exerciseDays]}
              onValueChange={(v) => setExerciseDays(v[0])}
              min={0}
              max={7}
              step={1}
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>0</span><span>7</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="exercise-desc">Describe que tipo de ejercicio haces</Label>
            <Textarea
              id="exercise-desc"
              placeholder="Ejemplo: Camino 30 minutos al dia, hago pesas 3 veces por semana..."
              value={exerciseDesc}
              onChange={(e) => setExerciseDesc(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="health-notes">Alguna condicion medica o alergia alimentaria?</Label>
            <Textarea
              id="health-notes"
              placeholder="Ejemplo: Diabetes tipo 2, intolerancia a la lactosa..."
              value={healthNotes}
              onChange={(e) => setHealthNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Step 3: Food preferences */}
      {step === 3 && (
        <div className="space-y-5 flex-1">
          <h2 className="text-2xl font-bold">Tus gustos</h2>

          <div className="space-y-2">
            <Label>Agrega alimentos</Label>
            <div className="flex gap-2">
              <Select value={foodTagType} onValueChange={(v) => setFoodTagType(v as PreferenceType)}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(tagLabels) as [PreferenceType, string][]).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Ej: Pollo, Brocoli..."
                value={foodInput}
                onChange={(e) => setFoodInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFoodTag() } }}
                className="flex-1"
              />
              <Button type="button" onClick={addFoodTag} size="icon">+</Button>
            </div>
          </div>

          {foodTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {foodTags.map((tag, i) => (
                <Badge key={i} variant={tagColors[tag.type]} className="gap-1 text-sm py-1.5 px-3">
                  {tag.name}
                  <button onClick={() => removeFoodTag(i)} className="ml-1" aria-label="Quitar">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="space-y-3">
            <Label>Tipo de cocina que prefieres</Label>
            <div className="grid grid-cols-2 gap-3">
              {CUISINES.map((cuisine) => (
                <label
                  key={cuisine}
                  className="flex items-center gap-3 min-h-[48px] px-3 py-2 rounded-xl border cursor-pointer hover:bg-accent"
                >
                  <Checkbox
                    checked={selectedCuisines.includes(cuisine)}
                    onCheckedChange={() => toggleCuisine(cuisine)}
                  />
                  <span className="text-base">{cuisine}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="diet-notes">Algo mas que debamos saber sobre tu alimentacion?</Label>
            <Textarea
              id="diet-notes"
              placeholder="Ejemplo: Prefiero comidas simples y rapidas de preparar..."
              value={dietNotes}
              onChange={(e) => setDietNotes(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Step 4: Summary */}
      {step === 4 && (
        <div className="space-y-5 flex-1">
          <h2 className="text-2xl font-bold">Tu plan personalizado</h2>

          <Card>
            <CardContent className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-xl bg-secondary">
                  <p className="text-sm text-muted-foreground">IMC</p>
                  <p className="text-2xl font-bold">{bmi}</p>
                  <p className="text-sm text-muted-foreground">{getBMICategory(bmi)}</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-secondary">
                  <p className="text-sm text-muted-foreground">Peso ideal</p>
                  <p className="text-2xl font-bold">{idealWeight} kg</p>
                </div>
              </div>

              <div className="text-center p-4 rounded-xl bg-accent">
                <p className="text-sm text-muted-foreground">Calorias diarias objetivo</p>
                <p className="text-3xl font-bold text-primary">{formatCalories(calorieTarget)}</p>
              </div>

              {macros && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-xl bg-blue-50">
                    <p className="text-xs text-muted-foreground">Proteina</p>
                    <p className="text-lg font-bold text-blue-700">{formatMacro(macros.protein_g)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-amber-50">
                    <p className="text-xs text-muted-foreground">Carbos</p>
                    <p className="text-lg font-bold text-amber-700">{formatMacro(macros.carbs_g)}</p>
                  </div>
                  <div className="text-center p-3 rounded-xl bg-rose-50">
                    <p className="text-xs text-muted-foreground">Grasa</p>
                    <p className="text-lg font-bold text-rose-700">{formatMacro(macros.fat_g)}</p>
                  </div>
                </div>
              )}

              <p className="text-sm text-muted-foreground text-center">
                Basado en tus datos personales y nivel de actividad
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex gap-3 mt-6 pt-4 border-t border-border">
        {step > 1 && (
          <Button variant="outline" size="lg" onClick={prevStep} className="flex-1">
            <ChevronLeft className="h-5 w-5 mr-1" /> Atras
          </Button>
        )}
        {step < totalSteps ? (
          <Button size="lg" onClick={nextStep} className="flex-1">
            Siguiente <ChevronRight className="h-5 w-5 ml-1" />
          </Button>
        ) : (
          <Button size="lg" onClick={handleFinish} disabled={saving} className="flex-1">
            {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Empezar mi plan"}
          </Button>
        )}
      </div>
    </div>
  )
}
