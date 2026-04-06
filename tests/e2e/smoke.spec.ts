import { test, expect } from "@playwright/test"

// Basic smoke tests - verify the app boots and unauthenticated routing works.
// Full auth/onboarding/AI flows require a test Supabase user and live API key,
// so they are kept out of the default smoke run.

test("app loads and redirects unauthenticated users to /auth", async ({ page }) => {
  await page.goto("/")
  await page.waitForURL(/\/auth/)
  await expect(page.getByRole("heading", { name: /NutriTrack|iniciar|entrar|bienvenido/i }).first()).toBeVisible({
    timeout: 10_000,
  })
})

test("auth page shows email and password fields", async ({ page }) => {
  await page.goto("/auth")
  await expect(page.locator('input[type="email"]').first()).toBeVisible()
  await expect(page.locator('input[type="password"]').first()).toBeVisible()
})

test("protected route /inicio redirects unauthenticated users to /auth", async ({ page }) => {
  await page.goto("/inicio")
  await page.waitForURL(/\/auth/, { timeout: 10_000 })
  expect(page.url()).toContain("/auth")
})
