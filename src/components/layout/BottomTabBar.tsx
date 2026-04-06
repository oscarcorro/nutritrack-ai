import { NavLink } from "react-router-dom"
import { Home, UtensilsCrossed, Plus, TrendingUp, User } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { to: "/inicio", icon: Home, label: "Inicio" },
  { to: "/plan", icon: UtensilsCrossed, label: "Plan" },
  { to: "/registrar", icon: Plus, label: "Registrar", fab: true },
  { to: "/progreso", icon: TrendingUp, label: "Progreso" },
  { to: "/perfil", icon: User, label: "Perfil" },
]

export function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 safe-bottom pointer-events-none">
      <div className="max-w-lg mx-auto px-3 pb-2 pointer-events-auto">
        <div className="relative flex items-center justify-around h-16 px-2 rounded-2xl border border-border/70 bg-background/90 backdrop-blur-xl shadow-[0_6px_24px_rgba(17,23,20,0.08)]">
          {tabs.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                cn(
                  "relative flex flex-col items-center justify-center min-w-[60px] min-h-[48px] rounded-xl",
                  tab.fab ? "" : "gap-0.5",
                  isActive && !tab.fab ? "text-primary" : !tab.fab ? "text-muted-foreground" : ""
                )
              }
            >
              {({ isActive }) =>
                tab.fab ? (
                  <div className="flex flex-col items-center gap-0.5">
                    <div
                      className={cn(
                        "flex items-center justify-center w-14 h-14 -mt-7 rounded-full text-primary-foreground",
                        "bg-gradient-to-b from-[#1fa85b] to-[#117a41]",
                        "shadow-[0_8px_24px_rgba(21,134,74,0.45)] ring-4 ring-background",
                        "transition-transform active:scale-95"
                      )}
                    >
                      <tab.icon className="h-7 w-7" />
                    </div>
                    <span className="text-[11px] font-semibold text-primary">{tab.label}</span>
                  </div>
                ) : (
                  <>
                    {isActive && (
                      <span
                        aria-hidden
                        className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-8 h-1 rounded-full bg-primary nt-fade-in"
                      />
                    )}
                    <tab.icon
                      className={cn(
                        "h-6 w-6 transition-transform",
                        isActive ? "text-primary scale-110" : ""
                      )}
                    />
                    <span
                      className={cn(
                        "text-[11px] font-medium",
                        isActive ? "text-primary" : ""
                      )}
                    >
                      {tab.label}
                    </span>
                  </>
                )
              }
            </NavLink>
          ))}
        </div>
      </div>
    </nav>
  )
}
