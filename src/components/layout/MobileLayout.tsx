import { Outlet, Link, useLocation } from "react-router-dom"
import { User } from "lucide-react"
import { BottomTabBar } from "./BottomTabBar"
import { GuidedTour } from "@/components/onboarding/GuidedTour"

export function MobileLayout() {
  const location = useLocation()
  return (
    <div className="flex flex-col min-h-svh bg-background max-w-lg mx-auto">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-4 h-14 bg-background/95 backdrop-blur border-b border-border">
        <h1 className="text-xl font-bold text-primary">NutriTrack</h1>
        <Link
          to="/perfil"
          className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary"
          aria-label="Perfil"
        >
          <User className="h-5 w-5 text-foreground" />
        </Link>
      </header>

      {/* Page content — keyed on pathname so each route fades in smoothly */}
      <main key={location.pathname} className="flex-1 px-4 py-4 pb-24 overflow-y-auto nt-page">
        <Outlet />
      </main>

      {/* Bottom tabs */}
      <BottomTabBar />

      {/* Interactive onboarding tour */}
      <GuidedTour />
    </div>
  )
}
