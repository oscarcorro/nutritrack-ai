import type { ActivityLevel, Gender, GoalType, GoalIntensity } from '@/integrations/supabase/types'

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

/**
 * Intensity-tuned calorie target.
 *
 * Deficits/surpluses are expressed as a percentage of TDEE rather than a
 * fixed kcal number — a 500 kcal deficit is ~25% of a 2000 kcal day (too
 * aggressive, unsustainable, burns muscle) but only ~17% of a 3000 kcal
 * day. Percentage-based scaling is the consensus in evidence-based
 * nutrition (Helms, Aragon, Schoenfeld).
 *
 * CUTTING (lose_weight):
 *   light      = -12% TDEE  → ~0.25-0.4 kg/wk, maximal muscle retention,
 *                             good for lean individuals or long cuts.
 *   moderate   = -20% TDEE  → ~0.5-0.7 kg/wk, standard evidence-based cut.
 *   aggressive = -28% TDEE  → ~0.8-1.0 kg/wk, faster but higher risk of
 *                             lean-mass loss; only advisable for higher
 *                             body-fat starting points and short blocks.
 *
 * BULKING (gain_muscle):
 *   light      = +8% TDEE   → lean gain, minimal fat.
 *   moderate   = +12% TDEE  → standard lean bulk (~0.25-0.4 kg/wk).
 *   aggressive = +18% TDEE  → faster gains, more fat accrual.
 *
 * Hard floor at 1500 kcal (male) / 1200 kcal (female) — never drop below
 * that without medical supervision.
 */
export function calculateCalorieTarget(
  tdee: number,
  goalType: GoalType,
  intensity: GoalIntensity = 'moderate',
  gender: Gender = 'male'
): number {
  const cutPct: Record<GoalIntensity, number> = { light: 0.12, moderate: 0.20, aggressive: 0.28 }
  const bulkPct: Record<GoalIntensity, number> = { light: 0.08, moderate: 0.12, aggressive: 0.18 }
  const floor = gender === 'male' ? 1500 : 1200
  let target: number
  switch (goalType) {
    case 'lose_weight':
      target = Math.round(tdee * (1 - cutPct[intensity]))
      break
    case 'gain_muscle':
      target = Math.round(tdee * (1 + bulkPct[intensity]))
      break
    case 'maintain':
      target = tdee
      break
  }
  return Math.max(floor, target)
}

/**
 * Evidence-based macro split.
 *
 * Protein is anchored to body weight (g/kg), not calorie %, because
 * protein needs don't scale with TDEE — they scale with lean mass.
 *   - Cutting:         2.2 g/kg  (high end, preserves LBM in deficit)
 *   - Gaining muscle:  1.8 g/kg  (sufficient for MPS, leaves room for carbs)
 *   - Maintenance:     1.6 g/kg  (general health floor)
 * Fat ≥ 0.8 g/kg to preserve hormonal health (testosterone, leptin).
 * Remaining calories → carbs. Fiber target scales with calories (14 g / 1000 kcal).
 */
export function calculateMacros(
  calories: number,
  goalType: GoalType,
  weightKg: number
) {
  const proteinPerKg =
    goalType === 'lose_weight' ? 2.2 :
    goalType === 'gain_muscle' ? 1.8 : 1.6
  const fatPerKg = 0.9
  const protein_g = Math.round(proteinPerKg * weightKg)
  const fat_g = Math.round(fatPerKg * weightKg)
  const proteinCal = protein_g * 4
  const fatCal = fat_g * 9
  const remainingCal = Math.max(0, calories - proteinCal - fatCal)
  const carbs_g = Math.round(remainingCal / 4)
  const fiber_g = Math.max(25, Math.round((calories / 1000) * 14))
  return { protein_g, carbs_g, fat_g, fiber_g }
}

export const INTENSITY_LABELS: Record<GoalIntensity, string> = {
  light: 'Suave',
  moderate: 'Moderado',
  aggressive: 'Agresivo',
}

export function describeIntensity(goalType: GoalType, intensity: GoalIntensity): string {
  if (goalType === 'maintain') return 'Mantener peso, sin deficit ni superavit'
  if (goalType === 'lose_weight') {
    return {
      light: '-12% kcal · ~0.3 kg/semana · maxima retencion muscular',
      moderate: '-20% kcal · ~0.6 kg/semana · estandar basado en ciencia',
      aggressive: '-28% kcal · ~0.9 kg/semana · rapido, solo bloques cortos',
    }[intensity]
  }
  return {
    light: '+8% kcal · volumen limpio, minima grasa',
    moderate: '+12% kcal · volumen estandar',
    aggressive: '+18% kcal · volumen rapido, mas grasa',
  }[intensity]
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
