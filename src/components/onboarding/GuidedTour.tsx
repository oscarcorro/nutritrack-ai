import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react"

type TourStep = {
  route: string
  title: string
  body: string
}

// Linear walkthrough. Each step corresponds to a route — advancing the
// tour navigates automatically, like a short interactive video.
const STEPS: TourStep[] = [
  {
    route: "/inicio",
    title: "Bienvenido a NutriTrack",
    body: "Esta es tu pagina de inicio. Aqui ves el anillo de calorias del dia, los macros y accesos rapidos. Voy a enseñarte el resto.",
  },
  {
    route: "/perfil",
    title: "Tu perfil y despensa",
    body: "Desde aqui ajustas tus datos, objetivos, horarios de comidas y despensa. Añade productos con macros exactos para que el conteo sea preciso.",
  },
  {
    route: "/plan",
    title: "Plan diario",
    body: "Dicta o escribe lo que haras hoy y genera un plan. Puedes pedir sugerencias de comidas concretas o cambiar las que no te gusten.",
  },
  {
    route: "/registrar",
    title: "Registrar comida",
    body: "Haz una foto, dicta por voz o escribe lo que has comido. La IA calcula calorias y macros y puedes editarlos antes de guardar.",
  },
  {
    route: "/progreso",
    title: "Progreso",
    body: "Revisa la evolucion de tu peso y la adherencia al plan. Pesate cada manana para mejores resultados.",
  },
  {
    route: "/inicio",
    title: "Listo para empezar",
    body: "Pasos recomendados: 1) revisa perfil, 2) añade despensa, 3) genera el plan de hoy, 4) registra cada comida, 5) pesate cada manana. Puedes reabrir esta guia desde Perfil.",
  },
]

const STORAGE_KEY_PREFIX = "nutritrack.tour.v2.completed."
const OPEN_EVENT = "nutritrack:open-tour"

/** Imperatively opens the tour from anywhere (e.g. Profile page button). */
export function openGuidedTour() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function GuidedTour() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const storageKey = user ? `${STORAGE_KEY_PREFIX}${user.id}` : null
  // Track last step we "navigated for" so re-renders don't loop-navigate.
  const lastNavigatedStep = useRef<number>(-1)

  // First-time auto-open (per user). Uses a ref so it only fires once per
  // mount — avoids the step-5 reset loop when the tour itself navigates
  // back to /inicio on its last step.
  const hasAutoOpenedRef = useRef(false)
  useEffect(() => {
    if (!storageKey) return
    if (hasAutoOpenedRef.current) return
    const done = localStorage.getItem(storageKey)
    if (done) return
    if (location.pathname !== "/inicio") return
    hasAutoOpenedRef.current = true
    // Mark as done upfront so a crash / refresh never reopens it automatically.
    localStorage.setItem(storageKey, "1")
    setOpen(true)
    setStep(0)
    lastNavigatedStep.current = 0
  }, [storageKey, location.pathname])

  // Listen for manual open event
  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setStep(0)
      lastNavigatedStep.current = -1
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // When step changes, navigate to its route if we're not already there
  useEffect(() => {
    if (!open) return
    if (lastNavigatedStep.current === step) return
    const target = STEPS[step]?.route
    if (target && location.pathname !== target) {
      navigate(target)
    }
    lastNavigatedStep.current = step
  }, [open, step, navigate, location.pathname])

  if (!open) return null

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  const finish = () => {
    if (storageKey) localStorage.setItem(storageKey, "1")
    setOpen(false)
  }

  const next = () => {
    if (isLast) finish()
    else setStep(step + 1)
  }
  const prev = () => {
    if (!isFirst) setStep(step - 1)
  }

  return (
    <>
      {/* Dim background so the tour card pops */}
      <div
        className="fixed inset-0 bg-black/30 z-40 nt-fade-in pointer-events-none"
        aria-hidden
      />

      {/* Floating tour card — sits above the bottom tab bar */}
      <div
        role="dialog"
        aria-label="Guia de la app"
        className="fixed left-1/2 -translate-x-1/2 bottom-24 w-[min(92vw,28rem)] z-50 nt-slide-up"
      >
        <div className="rounded-2xl border border-border bg-background shadow-2xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Paso {step + 1} de {STEPS.length}
                </p>
                <p className="font-semibold leading-tight">{s.title}</p>
              </div>
            </div>
            <button
              onClick={finish}
              className="p-1 rounded-md hover:bg-secondary"
              aria-label="Cerrar guia"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <p className="text-sm text-foreground/90">{s.body}</p>

          <div className="flex justify-center gap-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"
                }`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" className="flex-1" onClick={prev}>
                <ArrowLeft className="h-4 w-4 mr-1" /> Atras
              </Button>
            )}
            <Button size="sm" className="flex-1" onClick={next}>
              {isLast ? "Terminar" : (<>Siguiente <ArrowRight className="h-4 w-4 ml-1" /></>)}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
