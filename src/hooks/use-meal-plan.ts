import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { MealPlan, MealPlanItem } from '@/integrations/supabase/types'

export interface MealPlanWithItems extends MealPlan {
  items: MealPlanItem[]
}

export function useMealPlan(date: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['meal-plan', user?.id, date],
    queryFn: async (): Promise<MealPlanWithItems | null> => {
      if (!user) throw new Error('No user')

      const { data: plan, error: planError } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .eq('plan_date', date)
        .maybeSingle()

      if (planError) throw planError
      if (!plan) return null

      const typedPlan = plan as unknown as MealPlan

      const { data: items, error: itemsError } = await supabase
        .from('meal_plan_items')
        .select('*')
        .eq('meal_plan_id', typedPlan.id)
        .order('sort_order', { ascending: true })

      if (itemsError) throw itemsError

      return { ...typedPlan, items: (items || []) as unknown as MealPlanItem[] }
    },
    enabled: !!user && !!date,
  })
}
