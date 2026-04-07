import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { PantrySection } from "@/components/pantry/PantrySection"

export default function PantryPage() {
  const navigate = useNavigate()
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Volver"
          onClick={() => navigate(-1)}
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <h2 className="text-2xl font-bold">Despensa</h2>
      </div>
      <PantrySection />
    </div>
  )
}
