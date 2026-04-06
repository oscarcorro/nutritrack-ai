import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  Sparkles,
  Home,
  CalendarDays,
  Camera,
  Refrigerator,
  TrendingUp,
  User,
  CheckCircle2,
} from "lucide-react"

type Step = {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
}

const STEPS: Step[] = [
  {
    icon: <Sparkles className="h-10 w-10 text-primary" />,
    title: "Bienvenido a NutriTrack",
    body: (
      <>
        <p>Te ayudo a adelgazar con planes diarios, seguimiento preciso de calorias y macros, y reconocimiento de comida por foto, audio o texto.</p>
        <p className="text-sm text-muted-foreground">Te guio en menos de un minuto.</p>
      </>
    ),
  },
  {
    icon: <User className="h-10 w-10 text-primary" />,
    title: "1. Completa tu perfil",
    body: (
      <p>
        Desde <strong>Perfil</strong> (icono arriba a la derecha) ajusta peso, altura, objetivos, horarios de comidas y preferencias. La IA lo usa todo para personalizar los planes.
      </p>
    ),
  },
  {
    icon: <Refrigerator className="h-10 w-10 text-primary" />,
    title: "2. Llena tu despensa",
    body: (
      <>
        <p>En <strong>Perfil → Despensa</strong> añade los productos que comes habitualmente. Puedes:</p>
        <ul className="text-sm list-disc pl-5 space-y-1">
          <li>Hacer fotos a tu nevera para detectarlos automaticamente.</li>
          <li>Escanear la etiqueta nutricional de un producto para tener macros exactos.</li>
        </ul>
        <p className="text-sm">Asi cuando digas "150g de yogur Pastoret" el conteo sera preciso.</p>
      </>
    ),
  },
  {
    icon: <CalendarDays className="h-10 w-10 text-primary" />,
    title: "3. Genera tu plan diario",
    body: (
      <p>
        En <strong>Plan</strong> dicta o escribe lo que vas a hacer hoy (gym, paseo, dia sedentario) y genera un plan adaptado. Puedes pedir sugerencias para huecos concretos o cambiar comidas que no te gusten.
      </p>
    ),
  },
  {
    icon: <Camera className="h-10 w-10 text-primary" />,
    title: "4. Registra lo que comes",
    body: (
      <>
        <p>En <strong>+ Registrar</strong> (boton central) puedes:</p>
        <ul className="text-sm list-disc pl-5 space-y-1">
          <li>Hacer una foto del plato.</li>
          <li>Dictar por voz ("he comido 150g de pollo con arroz").</li>
          <li>Escribirlo.</li>
        </ul>
        <p className="text-sm">La IA analiza y calcula calorias y macros. Puedes corregir antes de guardar.</p>
      </>
    ),
  },
  {
    icon: <Home className="h-10 w-10 text-primary" />,
    title: "5. Sigue tu dia en Inicio",
    body: (
      <p>
        En <strong>Inicio</strong> ves el anillo de calorias consumidas vs objetivo, los macros del dia y acciones rapidas. Es tu panel principal.
      </p>
    ),
  },
  {
    icon: <TrendingUp className="h-10 w-10 text-primary" />,
    title: "6. Revisa tu progreso",
    body: (
      <p>
        En <strong>Progreso</strong> ves la evolucion de tu peso, la adherencia al plan y tu racha. Registra el peso cada manana para mejores resultados.
      </p>
    ),
  },
  {
    icon: <CheckCircle2 className="h-10 w-10 text-green-600" />,
    title: "Listo para empezar",
    body: (
      <>
        <p>Resumen de pasos iniciales:</p>
        <ol className="text-sm list-decimal pl-5 space-y-1">
          <li>Revisa tu perfil y objetivos.</li>
          <li>Añade productos a la despensa.</li>
          <li>Genera el plan de hoy.</li>
          <li>Registra cada comida en cuanto la tomes.</li>
          <li>Pesate cada manana.</li>
        </ol>
        <p className="text-sm text-muted-foreground">Puedes volver a ver esta guia desde Perfil.</p>
      </>
    ),
  },
]

export function AppTour({ forceOpen, onClose }: { forceOpen?: boolean; onClose?: () => void }) {
  const { user } = useAuth()
  const storageKey = user ? `nutritrack.tour.completed.${user.id}` : null
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (forceOpen) {
      setOpen(true)
      setStep(0)
      return
    }
    if (!storageKey) return
    const done = localStorage.getItem(storageKey)
    if (!done) {
      setOpen(true)
      setStep(0)
    }
  }, [storageKey, forceOpen])

  const finish = () => {
    if (storageKey) localStorage.setItem(storageKey, "1")
    setOpen(false)
    onClose?.()
  }

  const s = STEPS[step]
  const isLast = step === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) finish() }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex flex-col items-center gap-3 pt-2">
            {s.icon}
            <DialogTitle className="text-center text-xl">{s.title}</DialogTitle>
          </div>
        </DialogHeader>
        <div className="space-y-3 text-base">{s.body}</div>
        <div className="flex justify-center gap-1 pt-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === step ? "w-6 bg-primary" : "w-1.5 bg-muted"}`}
            />
          ))}
        </div>
        <DialogFooter className="flex-row gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="flex-1">
              Atras
            </Button>
          )}
          {!isLast ? (
            <Button onClick={() => setStep(step + 1)} className="flex-1">
              Siguiente
            </Button>
          ) : (
            <Button onClick={finish} className="flex-1">
              Empezar
            </Button>
          )}
        </DialogFooter>
        {!isLast && (
          <button
            onClick={finish}
            className="text-xs text-muted-foreground underline text-center mt-1"
          >
            Saltar guia
          </button>
        )}
      </DialogContent>
    </Dialog>
  )
}
