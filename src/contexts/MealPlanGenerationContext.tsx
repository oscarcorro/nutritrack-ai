import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { supabase } from "@/integrations/supabase/client"
import { useAuth } from "@/contexts/AuthContext"
import { toast } from "sonner"

interface Ctx {
  isGenerating: (date: string) => boolean
  start: (date: string) => Promise<void>
}

const MealPlanGenerationContext = createContext<Ctx | null>(null)

/**
 * Tracks in-flight meal plan generation requests at the app level so that
 * navigating away from /plan doesn't cancel them. When generation finishes,
 * the relevant react-query cache is invalidated so whoever is mounted picks
 * up the new plan.
 */
export function MealPlanGenerationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const inFlight = useRef<Set<string>>(new Set())
  const [, force] = useState(0)

  const isGenerating = useCallback((date: string) => inFlight.current.has(date), [])

  const start = useCallback(
    async (date: string) => {
      if (inFlight.current.has(date)) return
      inFlight.current.add(date)
      force((n) => n + 1)
      try {
        const { data, error } = await supabase.functions.invoke("ai-generate-meal-plan", {
          body: { plan_date: date },
        })
        if (error) throw error
        if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error)
        toast.success(`Plan del ${date} generado`)
        queryClient.invalidateQueries({ queryKey: ["meal-plan", user?.id, date] })
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error al generar plan")
      } finally {
        inFlight.current.delete(date)
        force((n) => n + 1)
      }
    },
    [queryClient, user?.id]
  )

  return (
    <MealPlanGenerationContext.Provider value={{ isGenerating, start }}>
      {children}
    </MealPlanGenerationContext.Provider>
  )
}

export function useMealPlanGeneration(): Ctx {
  const ctx = useContext(MealPlanGenerationContext)
  if (!ctx) throw new Error("useMealPlanGeneration must be used inside MealPlanGenerationProvider")
  return ctx
}
