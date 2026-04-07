import { lazy, Suspense, useEffect } from "react"
import { initReminders } from "@/lib/notifications"
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider, useAuth } from "@/contexts/AuthContext"
import { MealPlanGenerationProvider } from "@/contexts/MealPlanGenerationContext"
import { Toaster } from "@/components/ui/toaster"
import { MobileLayout } from "@/components/layout/MobileLayout"
import { ProtectedRoute } from "@/components/shared/ProtectedRoute"
import { ErrorBoundary } from "@/components/shared/ErrorBoundary"

import AuthPage from "@/pages/AuthPage"
const OnboardingPage = lazy(() => import("@/pages/OnboardingPage"))
const HomePage = lazy(() => import("@/pages/HomePage"))
const MealPlanPage = lazy(() => import("@/pages/MealPlanPage"))
const LogMealPage = lazy(() => import("@/pages/LogMealPage"))
const ProgressPage = lazy(() => import("@/pages/ProgressPage"))
const ProfilePage = lazy(() => import("@/pages/ProfilePage"))
const AdminPage = lazy(() => import("@/pages/AdminPage"))
const ShoppingListPage = lazy(() => import("@/pages/ShoppingListPage"))

function PageSkeleton() {
  return (
    <div
      className="flex-1 px-4 py-5 animate-pulse"
      role="status"
      aria-label="Cargando…"
    >
      <div className="h-8 w-1/2 rounded-lg bg-secondary mb-4" />
      <div className="h-32 w-full rounded-2xl bg-secondary mb-3" />
      <div className="h-32 w-full rounded-2xl bg-secondary mb-3" />
      <div className="h-24 w-full rounded-2xl bg-secondary" />
    </div>
  )
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2, // 2 minutes
    },
  },
})

function RemindersBoot() {
  const { loading } = useAuth()
  useEffect(() => {
    if (loading) return
    initReminders()
  }, [loading])
  return null
}

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RemindersBoot />
          <MealPlanGenerationProvider>
          <Suspense fallback={<PageSkeleton />}>
          <ErrorBoundary>
          <Routes>
            {/* Public */}
            <Route path="/auth" element={<AuthPage />} />

            {/* Onboarding (auth required, no layout) */}
            <Route
              path="/onboarding"
              element={
                <ProtectedRoute requireOnboarding={false}>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />

            {/* App routes inside MobileLayout */}
            <Route
              element={
                <ProtectedRoute>
                  <MobileLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/inicio" element={<HomePage />} />
              <Route path="/plan" element={<MealPlanPage />} />
              <Route path="/compra" element={<ShoppingListPage />} />
              <Route path="/registrar" element={<LogMealPage />} />
              <Route path="/progreso" element={<ProgressPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/inicio" replace />} />
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Routes>
          </ErrorBoundary>
          </Suspense>
          <Toaster />
          </MealPlanGenerationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

export default App
