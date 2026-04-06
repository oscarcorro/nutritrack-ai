import { useState, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { useCreateFoodLog } from "@/hooks/use-food-log"
import { useAnalyzeFood, type AnalyzedFood } from "@/hooks/use-ai"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "sonner"
import { MEAL_TYPE_LABELS } from "@/lib/nutrition"
import type { MealType, LogInputMethod } from "@/integrations/supabase/types"
import { Camera, Mic, FileText, Loader2, Upload, MicOff } from "lucide-react"

function ManualEntryForm({
  onSave,
  saving,
  initial,
}: {
  inputMethod: LogInputMethod
  rawText: string
  onSave: (data: {
    meal_name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    meal_type: MealType
  }) => void
  saving: boolean
  initial?: AnalyzedFood | null
}) {
  const [mealName, setMealName] = useState(initial?.meal_name ?? "")
  const [calories, setCalories] = useState(initial ? String(Math.round(initial.calories)) : "")
  const [protein, setProtein] = useState(initial ? String(Math.round(initial.protein_g)) : "")
  const [carbs, setCarbs] = useState(initial ? String(Math.round(initial.carbs_g)) : "")
  const [fat, setFat] = useState(initial ? String(Math.round(initial.fat_g)) : "")
  const [mealType, setMealType] = useState<MealType>("lunch")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!mealName) {
      toast.error("Escribe el nombre de la comida")
      return
    }
    if (!calories) {
      toast.error("Indica las calorias")
      return
    }
    onSave({
      meal_name: mealName,
      calories: parseFloat(calories),
      protein_g: parseFloat(protein) || 0,
      carbs_g: parseFloat(carbs) || 0,
      fat_g: parseFloat(fat) || 0,
      meal_type: mealType,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="meal-type">Tipo de comida</Label>
        <Select value={mealType} onValueChange={(v) => setMealType(v as MealType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(MEAL_TYPE_LABELS) as [MealType, string][]).map(([key, label]) => (
              <SelectItem key={key} value={key}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="meal-name">Nombre de la comida</Label>
        <Input id="meal-name" placeholder="Ej: Pechuga de pollo con arroz" value={mealName} onChange={(e) => setMealName(e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="calories">Calorias (kcal)</Label>
          <Input id="calories" type="number" placeholder="450" value={calories} onChange={(e) => setCalories(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="protein">Proteina (g)</Label>
          <Input id="protein" type="number" placeholder="30" value={protein} onChange={(e) => setProtein(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="carbs">Carbos (g)</Label>
          <Input id="carbs" type="number" placeholder="50" value={carbs} onChange={(e) => setCarbs(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="fat">Grasa (g)</Label>
          <Input id="fat" type="number" placeholder="15" value={fat} onChange={(e) => setFat(e.target.value)} />
        </div>
      </div>
      <Button type="submit" className="w-full" size="lg" disabled={saving}>
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Guardar"}
      </Button>
    </form>
  )
}

export default function LogMealPage() {
  const navigate = useNavigate()
  const createFoodLog = useCreateFoodLog()
  const analyzeFood = useAnalyzeFood()
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState("text")
  const [aiResult, setAiResult] = useState<AnalyzedFood | null>(null)

  const runAnalyze = async (input: { text?: string; transcript?: string; image_base64?: string; media_type?: string }) => {
    try {
      const result = await analyzeFood.mutateAsync(input)
      setAiResult(result)
      toast.success("Analizado con IA")
      return true
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al analizar")
      setAiResult(null)
      return false
    }
  }

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [showPhotoForm, setShowPhotoForm] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const streamRef = useRef<MediaStream | null>(null)

  // Audio state
  const [isRecording, setIsRecording] = useState(false)
  const [transcript, setTranscript] = useState("")
  const [showAudioForm, setShowAudioForm] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null) // eslint-disable-line no-undef

  // Text state
  const [textInput, setTextInput] = useState("")
  const [showTextForm, setShowTextForm] = useState(false)

  const handleSave = async (data: {
    meal_name: string
    calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
    meal_type: MealType
  }) => {
    setSaving(true)
    try {
      const rawText = activeTab === "text" ? textInput : activeTab === "audio" ? transcript : null
      await createFoodLog.mutateAsync({
        logged_at: new Date().toISOString(),
        meal_type: data.meal_type,
        input_method: activeTab as LogInputMethod,
        raw_text: rawText,
        photo_url: null,
        audio_url: null,
        meal_name: data.meal_name,
        description: null,
        items: [],
        calories: data.calories,
        protein_g: data.protein_g,
        carbs_g: data.carbs_g,
        fat_g: data.fat_g,
        fiber_g: null,
        meal_plan_item_id: null,
        ai_confidence: null,
        ai_model: null,
      })
      toast.success("Comida registrada")
      navigate("/inicio")
    } catch {
      toast.error("Error al guardar")
    } finally {
      setSaving(false)
    }
  }

  // Camera functions
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)
    } catch {
      toast.error("No se pudo acceder a la camara")
    }
  }

  const capturePhoto = async () => {
    if (!videoRef.current) return
    const canvas = document.createElement("canvas")
    canvas.width = videoRef.current.videoWidth
    canvas.height = videoRef.current.videoHeight
    canvas.getContext("2d")?.drawImage(videoRef.current, 0, 0)
    const dataUrl = canvas.toDataURL("image/jpeg")
    setPhotoPreview(dataUrl)
    stopCamera()
    const ok = await runAnalyze({ image_base64: dataUrl, media_type: "image/jpeg" })
    if (ok) setShowPhotoForm(true)
  }

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    setCameraActive(false)
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      setPhotoPreview(dataUrl)
      const ok = await runAnalyze({ image_base64: dataUrl, media_type: file.type || "image/jpeg" })
      if (ok) setShowPhotoForm(true)
    }
    reader.readAsDataURL(file)
  }

  // Audio functions
  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      toast.error("Tu navegador no soporta reconocimiento de voz")
      return
    }
    const recognition = new SpeechRecognition()
    recognition.lang = "es-ES"
    recognition.continuous = true
    recognition.interimResults = true
    recognition.onresult = (event: SpeechRecognitionEvent) => { // eslint-disable-line no-undef
      let text = ""
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript
      }
      setTranscript(text)
    }
    recognition.onerror = () => {
      toast.error("Error en el reconocimiento de voz")
      setIsRecording(false)
    }
    recognition.start()
    recognitionRef.current = recognition
    setIsRecording(true)
  }

  const stopRecording = async () => {
    recognitionRef.current?.stop()
    setIsRecording(false)
    if (transcript) {
      const ok = await runAnalyze({ transcript })
      if (ok) setShowAudioForm(true)
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Registrar comida</h2>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="photo" className="gap-1">
            <Camera className="h-4 w-4" /> Foto
          </TabsTrigger>
          <TabsTrigger value="audio" className="gap-1">
            <Mic className="h-4 w-4" /> Audio
          </TabsTrigger>
          <TabsTrigger value="text" className="gap-1">
            <FileText className="h-4 w-4" /> Texto
          </TabsTrigger>
        </TabsList>

        {/* Photo tab */}
        <TabsContent value="photo">
          <Card>
            <CardContent className="p-4 space-y-4">
              {!showPhotoForm ? (
                <>
                  {cameraActive ? (
                    <div className="space-y-3">
                      <video ref={videoRef} autoPlay playsInline className="w-full rounded-xl" />
                      <div className="flex gap-3">
                        <Button onClick={capturePhoto} size="lg" className="flex-1">
                          <Camera className="h-5 w-5 mr-2" /> Capturar
                        </Button>
                        <Button onClick={stopCamera} variant="outline" size="lg">
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {photoPreview && (
                        <img src={photoPreview} alt="Foto de comida" className="w-full rounded-xl" />
                      )}
                      <Button onClick={startCamera} size="lg" className="w-full h-20 text-lg">
                        <Camera className="h-8 w-8 mr-3" /> Tomar foto
                      </Button>
                      <Button
                        variant="outline"
                        size="lg"
                        className="w-full"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <Upload className="h-5 w-5 mr-2" /> O elegir foto
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelect}
                      />
                    </div>
                  )}
                </>
              ) : (
                <>
                  {photoPreview && (
                    <img src={photoPreview} alt="Foto capturada" className="w-full rounded-xl max-h-48 object-cover" />
                  )}
                  <p className="text-sm text-muted-foreground">
                    Revisa y ajusta los datos detectados por IA antes de guardar.
                  </p>
                  <ManualEntryForm inputMethod="photo" rawText="" onSave={handleSave} saving={saving} initial={aiResult} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audio tab */}
        <TabsContent value="audio">
          <Card>
            <CardContent className="p-4 space-y-4">
              {!showAudioForm ? (
                <>
                  <Button
                    onClick={isRecording ? stopRecording : startRecording}
                    size="lg"
                    variant={isRecording ? "destructive" : "default"}
                    className="w-full h-20 text-lg"
                  >
                    {isRecording ? (
                      <><MicOff className="h-8 w-8 mr-3" /> Detener</>
                    ) : (
                      <><Mic className="h-8 w-8 mr-3" /> Hablar</>
                    )}
                  </Button>
                  {isRecording && (
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 bg-destructive rounded-full animate-pulse" />
                      <p className="text-sm text-muted-foreground">Escuchando...</p>
                    </div>
                  )}
                  {transcript && (
                    <div className="p-3 bg-secondary rounded-xl">
                      <p className="text-base">{transcript}</p>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="p-3 bg-secondary rounded-xl">
                    <p className="text-sm text-muted-foreground mb-1">Transcripcion:</p>
                    <p className="text-base">{transcript}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Revisa y ajusta los datos detectados por IA antes de guardar.
                  </p>
                  <ManualEntryForm inputMethod="audio" rawText={transcript} onSave={handleSave} saving={saving} initial={aiResult} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Text tab */}
        <TabsContent value="text">
          <Card>
            <CardContent className="p-4 space-y-4">
              {!showTextForm ? (
                <>
                  <Textarea
                    placeholder="Describe lo que has comido... Ej: Pechuga de pollo a la plancha con ensalada y arroz blanco"
                    value={textInput}
                    onChange={(e) => setTextInput(e.target.value)}
                    className="min-h-[120px]"
                  />
                  <Button
                    size="lg"
                    className="w-full"
                    disabled={analyzeFood.isPending}
                    onClick={async () => {
                      if (!textInput.trim()) {
                        toast.error("Escribe lo que comiste")
                        return
                      }
                      const ok = await runAnalyze({ text: textInput })
                      if (ok) setShowTextForm(true)
                    }}
                  >
                    {analyzeFood.isPending ? <><Loader2 className="h-5 w-5 mr-2 animate-spin" /> Analizando...</> : "Analizar con IA"}
                  </Button>
                </>
              ) : (
                <>
                  <div className="p-3 bg-secondary rounded-xl">
                    <p className="text-base">{textInput}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Revisa y ajusta los datos estimados por IA antes de guardar.
                  </p>
                  <ManualEntryForm inputMethod="text" rawText={textInput} onSave={handleSave} saving={saving} initial={aiResult} />
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
