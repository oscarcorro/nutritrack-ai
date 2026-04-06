import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import type { PantryItem } from '@/integrations/supabase/types'

export function usePantry() {
  const { user } = useAuth()
  return useQuery({
    queryKey: ['pantry', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('pantry_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data as unknown as PantryItem[]
    },
    enabled: !!user,
  })
}

export function useCreatePantryItem() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (item: Omit<PantryItem, 'id' | 'created_at' | 'user_id'>) => {
      if (!user) throw new Error('No user')
      const { data, error } = await supabase
        .from('pantry_items')
        .insert({ ...item, user_id: user.id } as never)
        .select()
        .single()
      if (error) throw error
      return data as unknown as PantryItem
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry', user?.id] })
    },
  })
}

export function useDeletePantryItem() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pantry_items').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pantry', user?.id] })
    },
  })
}

export interface DetectedPantryItem {
  name: string
  quantity_estimate: string
  category: string
}

export function useAnalyzePantryPhoto() {
  return useMutation({
    mutationFn: async (input: { image_base64: string; media_type?: string }) => {
      const { data, error } = await supabase.functions.invoke('ai-analyze-pantry', { body: input })
      if (error) throw error
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
      return data as { items: DetectedPantryItem[] }
    },
  })
}
