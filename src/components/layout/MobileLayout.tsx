import { Outlet, Link } from "react-router-dom"
import { User } from "lucide-react"
import { BottomTabBar } from "./BottomTabBar"
import { GuidedTour } from "@/components/onboarding/GuidedTour"
import { useProfile } from "@/hooks/use-profile"

export function MobileLayout() {
  const { data: profile } = useProfile()
  return (
    <div className="flex flex-col min-h-svh bg-background max-w-lg mx-auto relative">
      {/* Header */}
      <header className="sticky top-0 z-40 safe-top bg-background/85 backdrop-blur-xl border-b border-border/60">
        <div className="flex items-center justify-between px-5 h-14">
          <Link to="/inicio" className="flex items-center gap-2" aria-label="Inicio">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-primary/10 text-primary">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z" />
                <circle cx="12" cy="9" r="2.2" />
              </svg>
            </span>
            <h1 className="text-lg font-bold tracking-tight nt-gradient-text">NutriTrack</h1>
          </Link>
          <div
            className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary border border-border/60 overflow-hidden"
            aria-hidden="true"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            ) : (
              <User className="h-5 w-5 text-foreground" />
            )}
          </div>
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 px-4 py-5 pb-28 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom tabs */}
      <BottomTabBar />

      {/* Interactive onboarding tour */}
      <GuidedTour />
    </div>
  )
}
