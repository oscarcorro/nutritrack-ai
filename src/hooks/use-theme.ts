import { useCallback, useEffect, useState } from "react"

export type ThemeMode = "light" | "dark" | "system"

export const THEME_KEY = "nt:theme"

function readStored(): ThemeMode {
  if (typeof window === "undefined") return "system"
  try {
    const raw = localStorage.getItem(THEME_KEY)
    if (raw === "light" || raw === "dark" || raw === "system") return raw
  } catch {
    /* ignore */
  }
  return "system"
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === "dark") return true
  if (mode === "light") return false
  return systemPrefersDark()
}

/**
 * Applies the dark class on <html> based on the stored theme.
 * Safe to call before React mounts to avoid a flash of the wrong theme.
 */
export function applyStoredTheme(): void {
  if (typeof document === "undefined") return
  const mode = readStored()
  const dark = resolveDark(mode)
  document.documentElement.classList.toggle("dark", dark)
  document.documentElement.dataset.theme = mode
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(() => readStored())

  // Apply on mount + whenever theme changes.
  useEffect(() => {
    const dark = resolveDark(theme)
    document.documentElement.classList.toggle("dark", dark)
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem(THEME_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  // React to system changes when in 'system' mode.
  useEffect(() => {
    if (theme !== "system") return
    if (typeof window === "undefined" || !window.matchMedia) return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = (e: MediaQueryListEvent) => {
      document.documentElement.classList.toggle("dark", e.matches)
    }
    mq.addEventListener("change", listener)
    return () => mq.removeEventListener("change", listener)
  }, [theme])

  const setTheme = useCallback((next: ThemeMode) => {
    setThemeState(next)
  }, [])

  return { theme, setTheme }
}
