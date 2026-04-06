import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'

export interface AnalyzedFood {
  meal_name: string
  description: string
  items: { name: string; quantity_g: number }[]
  calories: number
  protein_g: number
  carbs_g: number
  fat_g: number
  fiber_g: number
  confidence: number
  model: string
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body })
  if (error) throw error
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
  return data as T
}

export function useAnalyzeFood() {
  return useMutation({
    mutationFn: (input: { text?: string; transcript?: string; image_base64?: string; media_type?: string }) =>
      invoke<AnalyzedFood>('ai-analyze-food', input),
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

export function useSwapMeal() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (item_id: string) => invoke<unknown>('ai-swap-meal', { item_id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['meal-plan', user?.id] })
    },
  })
}
