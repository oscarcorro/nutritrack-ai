import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { FoodPreference, CuisinePreference, PreferenceType } from '@/integrations/supabase/types'

export function useFoodPreferences() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['food-preferences', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('food_preferences')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as FoodPreference[]
    },
    enabled: !!user,
  })
}

export function useCuisinePreferences() {
  const { user } = useAuth()

  return useQuery({
    queryKey: ['cuisine-preferences', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('cuisine_preferences')
        .select('*')
        .eq('user_id', user.id)
      if (error) throw error
      return data as unknown as CuisinePreference[]
    },
    enabled: !!user,
  })
}

export function useCreateFoodPreference() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (pref: { food_name: string; preference_type: PreferenceType; category?: string; notes?: string }) => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('food_preferences')
        .insert({ ...pref, user_id: user.id } as never)
        .select()
        .single()
      if (error) throw error
      return data as unknown as FoodPreference
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-preferences', user?.id] })
    },
  })
}

export function useDeleteFoodPreference() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('food_preferences')
        .delete()
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['food-preferences', user?.id] })
    },
  })
}

export function useUpsertCuisinePreference() {
  const { user } = useAuth()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (pref: { cuisine_name: string; is_preferred: boolean }) => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('cuisine_preferences')
        .upsert(
          { user_id: user.id, cuisine_name: pref.cuisine_name, is_preferred: pref.is_preferred } as never,
          { onConflict: 'user_id,cuisine_name' }
        )
        .select()
        .single()
      if (error) throw error
      return data as unknown as CuisinePreference
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cuisine-preferences', user?.id] })
    },
  })
}
