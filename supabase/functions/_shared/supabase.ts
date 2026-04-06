import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0"

/**
 * Returns a Supabase client that forwards the caller's JWT so RLS applies
 * as the authenticated user. Edge functions should use this to read user data
 * safely without needing the service role key.
 */
export function getUserClient(req: Request): SupabaseClient {
  const authHeader = req.headers.get("Authorization") ?? ""
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  )
}

export async function getUser(client: SupabaseClient) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error("Unauthorized")
  return data.user
}

export interface UserContext {
  profile: Record<string, unknown>
  goal: Record<string, unknown> | null
  foodPrefs: Record<string, unknown>[]
  cuisinePrefs: Record<string, unknown>[]
  recentPlans: Record<string, unknown>[]
}

export async function loadUserContext(
  client: SupabaseClient,
  userId: string
): Promise<UserContext> {
  const [profileRes, goalRes, foodRes, cuisineRes, plansRes] = await Promise.all([
    client.from("profiles").select("*").eq("id", userId).maybeSingle(),
    client
      .from("user_goals")
      .select("*")
      .eq("user_id", userId)
      .eq("is_current", true)
      .maybeSingle(),
    client.from("food_preferences").select("*").eq("user_id", userId),
    client.from("cuisine_preferences").select("*").eq("user_id", userId),
    client
      .from("meal_plans")
      .select("plan_date, meal_plan_items(meal_type, meal_name)")
      .eq("user_id", userId)
      .order("plan_date", { ascending: false })
      .limit(3),
  ])

  return {
    profile: profileRes.data ?? {},
    goal: goalRes.data ?? null,
    foodPrefs: (foodRes.data ?? []) as Record<string, unknown>[],
    cuisinePrefs: (cuisineRes.data ?? []) as Record<string, unknown>[],
    recentPlans: (plansRes.data ?? []) as Record<string, unknown>[],
  }
}

export function buildUserContextPrompt(ctx: UserContext): string {
  const p = ctx.profile as Record<string, unknown>
  const g = ctx.goal as Record<string, unknown> | null
  const likes = ctx.foodPrefs.filter((f) => f.preference_type === "like").map((f) => f.food_name)
  const dislikes = ctx.foodPrefs.filter((f) => f.preference_type === "dislike").map((f) => f.food_name)
  const allergies = ctx.foodPrefs.filter((f) => f.preference_type === "allergy").map((f) => f.food_name)
  const intolerances = ctx.foodPrefs
    .filter((f) => f.preference_type === "intolerance")
    .map((f) => f.food_name)
  const cuisines = ctx.cuisinePrefs.filter((c) => c.is_preferred).map((c) => c.cuisine_name)
  const recent = ctx.recentPlans
    .map((pl) => {
      const items = ((pl.meal_plan_items as unknown[]) ?? [])
        .map((i) => (i as Record<string, unknown>).meal_name)
        .join(", ")
      return `- ${pl.plan_date}: ${items}`
    })
    .join("\n")

  return `PERFIL DEL USUARIO:
- Nombre: ${p.display_name ?? "Usuario"}
- Genero: ${p.gender ?? "no especificado"}
- Fecha nacimiento: ${p.birth_date ?? "no especificada"}
- Altura: ${p.height_cm ?? "?"} cm
- Nivel de actividad: ${p.activity_level ?? "no especificado"}
- Notas de salud: ${p.health_notes ?? "ninguna"}

OBJETIVOS NUTRICIONALES:
- Peso actual: ${p.weight_kg ?? g?.starting_weight_kg ?? "?"} kg
- Peso objetivo: ${g?.target_weight_kg ?? "?"} kg
- Tipo de objetivo: ${g?.goal_type ?? "?"}
- Calorias/dia: ${g?.daily_calories_target ?? "?"} kcal
- Proteina: ${g?.protein_g ?? "?"} g
- Carbos: ${g?.carbs_g ?? "?"} g
- Grasa: ${g?.fat_g ?? "?"} g
- Fibra: ${g?.fiber_g ?? "?"} g
- Comidas al dia: ${g?.meals_per_day ?? 5}

PREFERENCIAS ALIMENTARIAS:
- Le gusta: ${likes.join(", ") || "sin preferencias"}
- No le gusta: ${dislikes.join(", ") || "ninguno"}
- Alergias: ${allergies.join(", ") || "ninguna"}
- Intolerancias: ${intolerances.join(", ") || "ninguna"}
- Cocinas preferidas: ${cuisines.join(", ") || "variadas"}

PLANES RECIENTES (evitar repetir):
${recent || "ninguno"}
`
}
