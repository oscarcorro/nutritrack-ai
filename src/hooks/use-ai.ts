import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export interface AnalyzedFoodItem {
  name: string
  quantity_g: number
  source?: "pantry" | "approximation"
}

export interface FoodRecipe {
  ingredients: string[]
  steps: string[]
}

export interface AnalyzedFood {
  meal_name: string
  description: string
  items: AnalyzedFoodItem[]
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  confidence: number
  model: string
  recipe?: FoodRecipe
}

export interface ChatFoodReply {
  reply: string
  ready: boolean
  summary?: string
  ask?: string
  modify?: string
  model: string
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) {
    // supabase-js wraps non-2xx responses in FunctionsHttpError and hides the body.
    // Try to read the underlying response so the user sees the real reason.
    try {
      const resp = (error as { context?: Response }).context
      if (resp && typeof resp.json === "function") {
        const j = (await resp.clone().json()) as { error?: string }
        if (j?.error) throw new Error(`${name}: ${j.error}`)
      }
    } catch (inner) {
      if (inner instanceof Error && inner.message.startsWith(name)) throw inner
    }
    throw new Error(`${name}: ${error.message ?? "Edge function failed"}`)
  }
  if ((data as { error?: string })?.error) throw new Error(`${name}: ${(data as { error: string }).error}`)
  return data as T
}

export function useAnalyzeFood() {
  return useMutation({
    mutationFn: (input: {
      text?: string
      transcript?: string
      image_base64?: string
      media_type?: string
      pantry_items?: { name: string }[]
    }) => invoke<AnalyzedFood>('ai-analyze-food', input),
  })
}

export function useChatFood() {
  return useMutation({
    mutationFn: (input: {
      messages: { role: 'user' | 'assistant'; content: string }[]
      today_meals?: { name: string; kcal: number; meal_type: string }[]
    }) => invoke<ChatFoodReply>('ai-chat-food', input),
  })
}

export function useGenerateMealPlan() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (plan_date: string) =>
      invoke<{ plan_id: string; meals: number }>('ai-generate-meal-plan', { plan_date }),
    onSuccess: (_data, plan_date) => {
      queryClient.invalidateQueries({ queryKey: ['meal-plan', user?.id, plan_date] })
    },
  })
}

export function useSuggestMeal() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { plan_date: string; meal_type: string; notes?: string }) =>
      invoke<{ plan_id: string; item: unknown }>('ai-suggest-meal', input),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['meal-plan', user?.id, vars.plan_date] })
    },
  })
}

export function useSwapMeal() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { item_id: string; reason?: string }) =>
      invoke<unknown>('ai-swap-meal', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plan', user?.id] })
    },
  })
}
