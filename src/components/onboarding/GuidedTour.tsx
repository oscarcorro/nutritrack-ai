import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { X, ArrowRight, ArrowLeft, Sparkles } from "lucide-react"

/**
 * Each step highlights a DOM element (via [data-tour="..."]) on a route.
 * If the target can't be found (e.g. the card is conditionally hidden),
 * the step falls back to a centered card without a spotlight.
 */
type TourStep = {
  route: string
  target?: string
  title: string
  body: string
}

const STEPS: TourStep[] = [
  {
    route: "/inicio",
    title: "Bienvenido a NutriTrack",
    body:
      "Esta es tu página principal. Voy a enseñarte cómo funciona la app en menos de un minuto, resaltando cada parte importante.",
  },
  {
    route: "/inicio",
    target: "ring",
    title: "Tu día de un vistazo",
    body:
      "El anillo muestra las calorías consumidas frente a tu objetivo y los macros del día. Se actualiza al instante cuando registras comida.",
  },
  {
    route: "/inicio",
    target: "quick-actions",
    title: "Acciones rápidas",
    body:
      "Desde aquí puedes registrar una comida o anotar tu peso sin moverte de la pantalla principal.",
  },
  {
    route: "/perfil",
    target: "goals",
    title: "Tus objetivos",
    body:
      "Define si quieres perder grasa, mantener o ganar músculo, y escoge la intensidad (suave, moderado, agresivo). Esto ajusta tu déficit o superávit siguiendo la ciencia nutricional más actual.",
  },
  {
    route: "/perfil",
    target: "pantry",
    title: "Tu despensa",
    body:
      "Añade productos con sus macros exactos (foto de la etiqueta o manual). Cuando digas 'he comido 150g de X' el conteo será exacto, no una estimación.",
  },
  {
    route: "/plan",
    target: "plan-generate",
    title: "Plan diario a medida",
    body:
      "Dicta o escribe lo que vas a hacer hoy y genera un plan que respeta tus macros, tu despensa y tu entrenamiento. Puedes pedir sugerencias para huecos concretos.",
  },
  {
    route: "/registrar",
    target: "log-tabs",
    title: "Registrar comida",
    body:
      "Haz una foto, dicta por voz, o escríbelo. La IA calcula calorías y macros y puedes editar todo antes de guardar.",
  },
  {
    route: "/progreso",
    target: "weight",
    title: "Progreso",
    body:
      "Revisa la evolución de tu peso y la adherencia al plan. Pésate cada mañana para mejores resultados.",
  },
  {
    route: "/inicio",
    title: "Listo para empezar",
    body:
      "Pasos recomendados: 1) revisa tu perfil y objetivos, 2) llena la despensa, 3) genera el plan del día, 4) registra cada comida, 5) pésate cada mañana. Puedes reabrir esta guía desde Perfil.",
  },
]

const STORAGE_KEY_PREFIX = "nutritrack.tour.v3.completed."
const OPEN_EVENT = "nutritrack:open-tour"

export function openGuidedTour() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

type Rect = { top: number; left: number; width: number; height: number }

function findTarget(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tour="${id}"]`)
}

/** Poll briefly for a target that may not be mounted yet after navigation. */
function waitForTarget(id: string, timeoutMs = 1500): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const start = performance.now()
    const tick = () => {
      const el = findTarget(id)
      if (el) return resolve(el)
      if (performance.now() - start > timeoutMs) return resolve(null)
      requestAnimationFrame(tick)
    }
    tick()
  })
}

export function GuidedTour() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [typedBody, setTypedBody] = useState("")

  const storageKey = user ? `${STORAGE_KEY_PREFIX}${user.id}` : null
  const hasAutoOpenedRef = useRef(false)
  const lastNavigatedStepRef = useRef(-1)

  // Auto-open once per mount on first-time visit to /inicio
  useEffect(() => {
    if (!storageKey || hasAutoOpenedRef.current) return
    if (localStorage.getItem(storageKey)) return
    if (location.pathname !== "/inicio") return
    hasAutoOpenedRef.current = true
    localStorage.setItem(storageKey, "1")
    setOpen(true)
    setStep(0)
  }, [storageKey, location.pathname])

  // Manual open
  useEffect(() => {
    const onOpen = () => {
      setOpen(true)
      setStep(0)
      lastNavigatedStepRef.current = -1
    }
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])

  // Navigate to the step's route if needed
  useEffect(() => {
    if (!open) return
    if (lastNavigatedStepRef.current === step) return
    lastNavigatedStepRef.current = step
    const target = STEPS[step]?.route
    if (target && location.pathname !== target) {
      navigate(target)
    }
  }, [open, step, navigate, location.pathname])

  // Resolve the spotlight rect (after navigation + element mount)
  useEffect(() => {
    if (!open) {
      setRect(null)
      return
    }
    const s = STEPS[step]
    if (!s) return
    // Only compute rect once we're on the right route
    if (location.pathname !== s.route) return

    let cancelled = false
    setRect(null) // clear while resolving

    const resolve = async () => {
      if (!s.target) return
      const el = await waitForTarget(s.target)
      if (cancelled || !el) return
      // Scroll the target into view, then snapshot its rect
      el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" })
      // wait a frame for scroll to settle
      await new Promise((r) => setTimeout(r, 350))
      if (cancelled) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    void resolve()

    // Recompute on resize / scroll
    const update = () => {
      if (!s.target) return
      const el = findTarget(s.target)
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      cancelled = true
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open, step, location.pathname])

  // Typewriter effect on body text
  useEffect(() => {
    if (!open) {
      setTypedBody("")
      return
    }
    const full = STEPS[step]?.body ?? ""
    setTypedBody("")
    let i = 0
    const speedMs = 14
    const id = window.setInterval(() => {
      i++
      setTypedBody(full.slice(0, i))
      if (i >= full.length) window.clearInterval(id)
    }, speedMs)
    return () => window.clearInterval(id)
  }, [open, step])

  if (!open) return null

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  const finish = () => {
    if (storageKey) localStorage.setItem(storageKey, "1")
    setOpen(false)
  }
  const next = () => (isLast ? finish() : setStep(step + 1))
  const prev = () => !isFirst && setStep(step - 1)
  const skipTyping = () => setTypedBody(s.body)

  // Tooltip position: below the target by default, above if there's no room
  const CARD_HEIGHT_ESTIMATE = 220
  const GAP = 14
  let cardStyle: React.CSSProperties = {}
  if (rect) {
    const viewportH = window.innerHeight
    const belowSpace = viewportH - (rect.top + rect.height) - GAP
    const placeBelow = belowSpace >= CARD_HEIGHT_ESTIMATE
    cardStyle = {
      position: "fixed",
      left: "50%",
      transform: "translateX(-50%)",
      top: placeBelow ? rect.top + rect.height + GAP : undefined,
      bottom: placeBelow ? undefined : viewportH - rect.top + GAP,
      width: "min(92vw, 28rem)",
      zIndex: 60,
    }
  } else {
    cardStyle = {
      position: "fixed",
      left: "50%",
      bottom: "6rem",
      transform: "translateX(-50%)",
      width: "min(92vw, 28rem)",
      zIndex: 60,
    }
  }

  return (
    <>
      {/* Spotlight overlay: a small transparent box at the target's rect,
          surrounded by a massive box-shadow that dims everything else. */}
      {rect ? (
        <div
          aria-hidden
          className="fixed z-50 pointer-events-none rounded-2xl transition-all duration-300 nt-fade-in"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.55)",
            outline: "2px solid rgba(22, 163, 74, 0.9)",
            outlineOffset: "2px",
            borderRadius: 18,
          }}
        />
      ) : (
        // Fallback dim when there's no spotlight target
        <div
          aria-hidden
          className="fixed inset-0 z-50 bg-black/55 pointer-events-none nt-fade-in"
        />
      )}

      {/* Tour card */}
      <div role="dialog" aria-label="Guia de la app" style={cardStyle}>
        <div className="rounded-2xl border border-border bg-background shadow-2xl p-4 space-y-3 nt-fade-in">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Paso {step + 1} de {STEPS.length}
                </p>
                <p className="font-semibold leading-tight truncate">{s.title}</p>
              </div>
            </div>
            <button
              onClick={finish}
              className="p-1 rounded-md hover:bg-secondary shrink-0"
              aria-label="Cerrar guia"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Typewriter body */}
          <p
            className="text-sm text-foreground/90 min-h-[3.5rem] cursor-pointer"
            onClick={skipTyping}
            title="Toca para mostrar todo el texto"
          >
            {typedBody}
            {typedBody.length < s.body.length && (
              <span className="inline-block w-[2px] h-4 bg-primary align-middle ml-0.5 animate-pulse" />
            )}
          </p>

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
              {isLast ? (
                "Terminar"
              ) : (
                <>
                  Siguiente <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
