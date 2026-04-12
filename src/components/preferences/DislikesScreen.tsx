import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Plus, Loader2, ThumbsDown, X, Mic, MicOff, AlertTriangle, Ban } from "lucide-react"
import { toast } from "sonner"
import {
  useFoodPreferences,
  useCreateFoodPreference,
  useDeleteFoodPreference,
} from "@/hooks/use-food-preferences"
import type { PreferenceType } from "@/integrations/supabase/types"

const TYPE_LABELS: Record<string, string> = {
  dislike: "No me gusta",
  allergy: "Alergia",
  intolerance: "Intolerancia",
}

const TYPE_COLORS: Record<string, string> = {
  dislike: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  allergy: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  intolerance: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
}

export function DislikesScreen({ onClose }: { onClose?: () => void }) {
  const { data: prefs, isLoading } = useFoodPreferences()
  const createPref = useCreateFoodPreference()
  const deletePref = useDeleteFoodPreference()

  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState<PreferenceType>("dislike")
  const [isRecording, setIsRecording] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const audioTranscriptRef = useRef("")

  const dislikes = (prefs ?? []).filter((p) =>
    p.preference_type === "dislike" ||
    p.preference_type === "allergy" ||
    p.preference_type === "intolerance"
  )

  const handleAdd = () => {
    const name = newName.trim()
    if (!name) return
    const exists = dislikes.some(
      (p) => p.food_name.toLowerCase() === name.toLowerCase() && p.preference_type === newType
    )
    if (exists) { toast.info("Ya existe"); return }
    createPref.mutate(
      { food_name: name, preference_type: newType },
      {
        onSuccess: () => { setNewName(""); toast.success("Guardado") },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
      }
    )
  }

  const handleRemove = (id: string) => {
    deletePref.mutate(id, {
      onSuccess: () => toast.success("Eliminado"),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
    })
  }

  const startRecording = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { toast.error("Navegador no soporta voz"); return }
    audioTranscriptRef.current = ""
    const recognition = new SR()
    recognition.lang = "es-ES"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let t = ""
      for (let i = 0; i < event.results.length; i++) t += event.results[i][0].transcript
      audioTranscriptRef.current = t
    }
    recognition.onerror = () => { toast.error("Error de voz"); setIsRecording(false) }
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  const stopRecording = () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
    const transcript = audioTranscriptRef.current.trim()
    if (!transcript) { toast.error("No se escucho nada"); return }
    // Add each comma-separated item
    const items = transcript.split(/,|y /).map((s) => s.trim()).filter(Boolean)
    for (const item of items) {
      createPref.mutate(
        { food_name: item, preference_type: newType },
        { onError: () => {} }
      )
    }
    if (items.length > 0) toast.success(`${items.length} alimento(s) añadido(s)`)
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ThumbsDown className="h-5 w-5" /> No me gusta / Alergias
          </span>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>Cerrar</Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Los planes nunca incluiran estos alimentos.
        </p>

        {/* Type selector */}
        <div className="flex gap-1">
          {(["dislike", "allergy", "intolerance"] as PreferenceType[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setNewType(t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                newType === t
                  ? TYPE_COLORS[t] + " border-transparent font-medium"
                  : "bg-background border-border text-muted-foreground hover:bg-secondary"
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>

        {/* Add input */}
        <div className="flex gap-2">
          <Input
            placeholder={`Ej: ${newType === "allergy" ? "cacahuetes" : newType === "intolerance" ? "lactosa" : "coliflor"}`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAdd() }}
            className="flex-1"
          />
          <Button size="sm" onClick={handleAdd} disabled={createPref.isPending}>
            {createPref.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
          <button
            type="button"
            onClick={isRecording ? stopRecording : startRecording}
            className={`flex items-center justify-center w-10 h-10 rounded-full shrink-0 ${isRecording ? "bg-destructive text-destructive-foreground" : "hover:bg-secondary text-muted-foreground border border-border"}`}
            aria-label={isRecording ? "Parar" : "Dictar"}
          >
            {isRecording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </button>
        </div>

        {isRecording && (
          <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-destructive animate-pulse" />
            Escuchando... Di los alimentos separados por comas.
          </p>
        )}

        {/* Items list */}
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : dislikes.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {dislikes.map((p) => (
              <span
                key={p.id}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm ${TYPE_COLORS[p.preference_type] ?? "bg-secondary"}`}
              >
                {p.preference_type === "allergy" && <AlertTriangle className="h-3 w-3" />}
                {p.preference_type === "intolerance" && <Ban className="h-3 w-3" />}
                <span>{p.food_name}</span>
                <Badge variant="outline" className="text-[10px] px-1 py-0 border-current/20">
                  {TYPE_LABELS[p.preference_type]}
                </Badge>
                <button
                  type="button"
                  onClick={() => handleRemove(p.id)}
                  aria-label={`Quitar ${p.food_name}`}
                  className="hover:opacity-70"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No hay alimentos marcados. Añade los que no te gusten o te sienten mal.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
