import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { WeightLog } from '@/integrations/supabase/types'

export function useWeightLog(days = 30) {
  const { user } = useAuth()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - days)

  return useQuery({
    queryKey: ['weight-log', user?.id, days],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('weight_log')
        .select('*')
        .eq('user_id', user.id)
        .gte('measured_at', startDate.toISOString())
        .order('measured_at', { ascending: true })
      if (error) throw error
      return data as unknown as WeightLog[]
    },
    enabled: !!user,
  })
}

export function useCreateWeightLog() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (entry: { weight_kg: number; notes?: string }) => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('weight_log')
        .insert({
          user_id: user.id,
          weight_kg: entry.weight_kg,
          measured_at: new Date().toISOString(),
          notes: entry.notes || null,
        } as never)
        .select()
        .single()
      if (error) throw error
      return data as unknown as WeightLog
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['weight-log'] })
    },
  })
}
