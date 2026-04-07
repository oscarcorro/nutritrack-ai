// Saved recipes persisted in localStorage.

export interface SavedRecipe {
  id: string
  name: string
  ingredients: string[]
  steps: string[]
  kcal: number
  savedAt: number
}

const KEY = "nt:recipes:v1"
const MAX = 50

export function loadRecipes(): SavedRecipe[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const arr = JSON.parse(raw)
    return Array.isArray(arr) ? (arr as SavedRecipe[]) : []
  } catch {
    return []
  }
}

export function saveRecipes(list: SavedRecipe[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
    window.dispatchEvent(new Event("nt:recipes-changed"))
  } catch {
    // ignore
  }
}

export function addRecipe(r: Omit<SavedRecipe, "id" | "savedAt">): SavedRecipe {
  const list = loadRecipes()
  const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const entry: SavedRecipe = { ...r, id, savedAt: Date.now() }
  // dedupe by name (case-insensitive)
  const k = entry.name.trim().toLowerCase()
  const next = [entry, ...list.filter((x) => x.name.trim().toLowerCase() !== k)].slice(0, MAX)
  saveRecipes(next)
  return entry
}

export function deleteRecipe(id: string) {
  const list = loadRecipes().filter((r) => r.id !== id)
  saveRecipes(list)
}

export function isRecipeSaved(name: string): boolean {
  const k = name.trim().toLowerCase()
  return loadRecipes().some((r) => r.name.trim().toLowerCase() === k)
}
