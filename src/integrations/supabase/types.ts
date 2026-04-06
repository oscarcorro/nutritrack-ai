export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type UserRole = 'user' | 'admin'
export type Gender = 'male' | 'female'
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active'
export type GoalType = 'lose_weight' | 'maintain' | 'gain_muscle'
export type MealType = 'breakfast' | 'morning_snack' | 'lunch' | 'afternoon_snack' | 'dinner'
export type LogInputMethod = 'photo' | 'audio' | 'text' | 'manual'
export type PreferenceType = 'like' | 'dislike' | 'allergy' | 'intolerance'
export type PlanStatus = 'active' | 'completed' | 'skipped'

export interface Profile {
  id: string
  display_name: string
  role: UserRole
  avatar_url: string | null
  gender: Gender | null
  birth_date: string | null
  height_cm: number | null
  weight_kg: number | null
  activity_level: ActivityLevel | null
  exercise_days_per_week: number | null
  exercise_description: string | null
  health_notes: string | null
  meal_schedule: Record<string, string> | null
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface UserGoal {
  id: string
  user_id: string
  starting_weight_kg: number
  target_weight_kg: number
  ideal_weight_kg: number | null
  daily_calories_target: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  meals_per_day: number
  goal_type: GoalType
  is_current: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FoodPreference {
  id: string
  user_id: string
  food_name: string
  preference_type: PreferenceType
  category: string | null
  notes: string | null
  created_at: string
}

export interface CuisinePreference {
  id: string
  user_id: string
  cuisine_name: string
  is_preferred: boolean
  created_at: string
}

export interface MealPlan {
  id: string
  user_id: string
  plan_date: string
  total_calories: number | null
  total_protein_g: number | null
  total_carbs_g: number | null
  total_fat_g: number | null
  status: PlanStatus
  ai_model: string | null
  created_at: string
  updated_at: string
}

export interface MealPlanItem {
  id: string
  meal_plan_id: string
  meal_type: MealType
  sort_order: number
  meal_name: string
  description: string | null
  ingredients: Json
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  prep_time_min: number | null
  is_swapped: boolean
  original_item_id: string | null
  created_at: string
}

export interface FoodLog {
  id: string
  user_id: string
  logged_at: string
  meal_type: MealType | null
  input_method: LogInputMethod
  raw_text: string | null
  photo_url: string | null
  audio_url: string | null
  meal_name: string
  description: string | null
  items: Json
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
  fiber_g: number | null
  meal_plan_item_id: string | null
  ai_confidence: number | null
  ai_model: string | null
  created_at: string
  updated_at: string
}

export interface WeightLog {
  id: string
  user_id: string
  measured_at: string
  weight_kg: number
  notes: string | null
  created_at: string
}

export interface BodyMeasurement {
  id: string
  user_id: string
  measured_at: string
  waist_cm: number | null
  hip_cm: number | null
  chest_cm: number | null
  arm_cm: number | null
  thigh_cm: number | null
  body_fat_pct: number | null
  notes: string | null
  created_at: string
}

export interface PantryItem {
  id: string
  user_id: string
  name: string
  quantity_estimate: string | null
  category: string | null
  expires_at: string | null
  source: string | null
  created_at: string
}

export interface Database {
  public: {
    Tables: {
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string }; Update: Partial<Profile> }
      user_goals: { Row: UserGoal; Insert: Omit<UserGoal, 'id' | 'created_at' | 'updated_at'>; Update: Partial<UserGoal> }
      food_preferences: { Row: FoodPreference; Insert: Omit<FoodPreference, 'id' | 'created_at'>; Update: Partial<FoodPreference> }
      cuisine_preferences: { Row: CuisinePreference; Insert: Omit<CuisinePreference, 'id' | 'created_at'>; Update: Partial<CuisinePreference> }
      meal_plans: { Row: MealPlan; Insert: Omit<MealPlan, 'id' | 'created_at' | 'updated_at'>; Update: Partial<MealPlan> }
      meal_plan_items: { Row: MealPlanItem; Insert: Omit<MealPlanItem, 'id' | 'created_at'>; Update: Partial<MealPlanItem> }
      food_log: { Row: FoodLog; Insert: Omit<FoodLog, 'id' | 'created_at' | 'updated_at'>; Update: Partial<FoodLog> }
      weight_log: { Row: WeightLog; Insert: Omit<WeightLog, 'id' | 'created_at'>; Update: Partial<WeightLog> }
      body_measurements: { Row: BodyMeasurement; Insert: Omit<BodyMeasurement, 'id' | 'created_at'>; Update: Partial<BodyMeasurement> }
      pantry_items: { Row: PantryItem; Insert: Omit<PantryItem, 'id' | 'created_at'>; Update: Partial<PantryItem> }
    }
  }
}
