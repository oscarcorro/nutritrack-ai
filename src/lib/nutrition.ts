import type { ActivityLevel, Gender, GoalType } from '@/integrations/supabase/types'

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
}

const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary: 'Sedentario (poco o nada de ejercicio)',
  light: 'Ligero (1-2 días/semana)',
  moderate: 'Moderado (3-4 días/semana)',
  active: 'Activo (5-6 días/semana)',
  very_active: 'Muy activo (ejercicio diario intenso)',
}

export { ACTIVITY_LABELS }

export function calculateAge(birthDate: string): number {
  const today = new Date()
  const birth = new Date(birthDate)
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age
}

// Mifflin-St Jeor equation
export function calculateBMR(weightKg: number, heightCm: number, age: number, gender: Gender): number {
  if (gender === 'male') {
    return 10 * weightKg + 6.25 * heightCm - 5 * age + 5
  }
  return 10 * weightKg + 6.25 * heightCm - 5 * age - 161
}

export function calculateTDEE(bmr: number, activityLevel: ActivityLevel): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel])
}

export function calculateCalorieTarget(tdee: number, goalType: GoalType): number {
  switch (goalType) {
    case 'lose_weight': return Math.round(tdee - 500) // ~0.5kg/semana
    case 'gain_muscle': return Math.round(tdee + 300)
    case 'maintain': return tdee
  }
}

export function calculateMacros(calories: number, goalType: GoalType) {
  // Protein: 30%, Carbs: 40%, Fat: 30% for weight loss
  // Adjusted for other goals
  let proteinPct: number, carbsPct: number, fatPct: number
  switch (goalType) {
    case 'lose_weight':
      proteinPct = 0.30; carbsPct = 0.40; fatPct = 0.30
      break
    case 'gain_muscle':
      proteinPct = 0.30; carbsPct = 0.45; fatPct = 0.25
      break
    case 'maintain':
      proteinPct = 0.25; carbsPct = 0.45; fatPct = 0.30
      break
  }
  return {
    protein_g: Math.round((calories * proteinPct) / 4),
    carbs_g: Math.round((calories * carbsPct) / 4),
    fat_g: Math.round((calories * fatPct) / 9),
    fiber_g: 25,
  }
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10
}

export function getBMICategory(bmi: number): string {
  if (bmi < 18.5) return 'Bajo peso'
  if (bmi < 25) return 'Normal'
  if (bmi < 30) return 'Sobrepeso'
  return 'Obesidad'
}

// Devine formula for ideal weight
export function calculateIdealWeight(heightCm: number, gender: Gender): number {
  const heightInches = heightCm / 2.54
  if (gender === 'male') {
    return Math.round((50 + 2.3 * (heightInches - 60)) * 10) / 10
  }
  return Math.round((45.5 + 2.3 * (heightInches - 60)) * 10) / 10
}

export function formatCalories(cal: number): string {
  return `${Math.round(cal)} kcal`
}

export function formatMacro(grams: number): string {
  return `${Math.round(grams)}g`
}

export const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast: 'Desayuno',
  morning_snack: 'Media mañana',
  lunch: 'Comida',
  afternoon_snack: 'Merienda',
  dinner: 'Cena',
}

export const MEAL_TYPE_ICONS: Record<string, string> = {
  breakfast: '🌅',
  morning_snack: '🍎',
  lunch: '🍽️',
  afternoon_snack: '☕',
  dinner: '🌙',
}
