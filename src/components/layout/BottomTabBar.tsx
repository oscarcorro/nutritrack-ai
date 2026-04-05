import { NavLink } from "react-router-dom"
import { Home, UtensilsCrossed, Plus, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

const tabs = [
  { to: "/inicio", icon: Home, label: "Inicio" },
  { to: "/plan", icon: UtensilsCrossed, label: "Plan" },
  { to: "/registrar", icon: Plus, label: "Registrar", fab: true },
  { to: "/progreso", icon: TrendingUp, label: "Progreso" },
]

export function BottomTabBar() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center justify-center min-w-[64px] min-h-[48px] rounded-xl transition-colors",
                tab.fab ? "" : "gap-0.5",
                isActive && !tab.fab ? "text-primary" : !tab.fab ? "text-muted-foreground" : ""
              )
            }
          >
            {({ isActive }) =>
              tab.fab ? (
                <div className="flex flex-col items-center gap-0.5">
                  <div className="flex items-center justify-center w-14 h-14 -mt-5 rounded-full bg-primary text-primary-foreground shadow-lg">
                    <tab.icon className="h-7 w-7" />
                  </div>
                  <span className="text-xs font-medium text-primary">{tab.label}</span>
                </div>
              ) : (
                <>
                  <tab.icon className={cn("h-6 w-6", isActive ? "text-primary" : "")} />
                  <span className={cn("text-xs font-medium", isActive ? "text-primary" : "")}>
                    {tab.label}
                  </span>
                </>
              )
            }
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
