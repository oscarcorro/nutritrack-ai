import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { FoodLog } from '@/integrations/supabase/types'

export function useFoodLog(startDate: string, endDate: string) {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['food-log', user?.id, startDate, endDate],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('food_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('logged_at', startDate)
        .lte('logged_at', endDate)
        .order('logged_at', { ascending: true })
      if (error) throw error
      return data as unknown as FoodLog[]
    },
    enabled: !!user && !!startDate && !!endDate,
  })
}

export function useTodayFoodLog() {
  const today = new Date().toISOString().split('T')[0]
  return useFoodLog(`${today}T00:00:00`, `${today}T23:59:59`)
}

export function useCreateFoodLog() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (log: Omit<FoodLog, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('food_log')
        .insert({ ...log, user_id: user.id } as never)
        .select()
        .single()
      if (error) throw error
      return data as unknown as FoodLog
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-log'] })
    },
  })
}
