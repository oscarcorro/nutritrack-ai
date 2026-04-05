import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { UserGoal } from '@/integrations/supabase/types'

export function useCurrentGoal() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['goals', 'current', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('user_goals')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_current', true)
        .single()
      if (error && error.code !== 'PGRST116') throw error
      return (data as unknown as UserGoal) ?? null
    },
    enabled: !!user,
  })
}

export function useCreateGoal() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (goal: Omit<UserGoal, 'id' | 'created_at' | 'updated_at' | 'user_id'>) => {
      if (!user) throw new Error('No user')
      // Set all existing goals to not current
      await supabase
        .from('user_goals')
        .update({ is_current: false } as never)
        .eq('user_id', user.id)

      const { data, error } = await supabase
        .from('user_goals')
        .insert({ ...goal, user_id: user.id } as never)
        .select()
        .single()
      if (error) throw error
      return data as unknown as UserGoal
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals', 'current', user?.id] })
    },
  })
}
