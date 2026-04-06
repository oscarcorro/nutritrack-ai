import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { AuthProvider } from "@/contexts/AuthContext"
import { MealPlanGenerationProvider } from "@/contexts/MealPlanGenerationContext"
import { Toaster } from "@/components/ui/toaster"
import { MobileLayout } from "@/components/layout/MobileLayout"
import { ProtectedRoute } from "@/components/shared/ProtectedRoute"

import AuthPage from "@/pages/AuthPage"
import OnboardingPage from "@/pages/OnboardingPage"
import HomePage from "@/pages/HomePage"
import MealPlanPage from "@/pages/MealPlanPage"
import LogMealPage from "@/pages/LogMealPage"
import ProgressPage from "@/pages/ProgressPage"
import ProfilePage from "@/pages/ProfilePage"
import AdminPage from "@/pages/AdminPage"

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 2, // 2 minutes
    },
  },
})

function App() {
  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <MealPlanGenerationProvider>
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
              <Route path="/registrar" element={<LogMealPage />} />
              <Route path="/progreso" element={<ProgressPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              <Route path="/admin" element={<AdminPage />} />
            </Route>

            {/* Redirects */}
            <Route path="/" element={<Navigate to="/inicio" replace />} />
            <Route path="*" element={<Navigate to="/inicio" replace />} />
          </Routes>
          <Toaster />
          </MealPlanGenerationProvider>
        </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  )
}

export default App
