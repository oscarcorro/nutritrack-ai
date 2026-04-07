import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ArrowLeft, Trash2, ChefHat } from "lucide-react"
import { loadRecipes, deleteRecipe, type SavedRecipe } from "@/lib/recipes"
import { toast } from "sonner"

export default function RecipesPage() {
  const navigate = useNavigate()
  const [recipes, setRecipes] = useState<SavedRecipe[]>([])
  const [open, setOpen] = useState<SavedRecipe | null>(null)

  useEffect(() => {
    setRecipes(loadRecipes())
    const refresh = () => setRecipes(loadRecipes())
    window.addEventListener("nt:recipes-changed", refresh)
    window.addEventListener("storage", refresh)
    return () => {
      window.removeEventListener("nt:recipes-changed", refresh)
      window.removeEventListener("storage", refresh)
    }
  }, [])

  const handleDelete = (id: string) => {
    deleteRecipe(id)
    setRecipes(loadRecipes())
    setOpen(null)
    toast.success("Receta eliminada")
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Atrás">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h2 className="text-2xl font-bold">Mis recetas</h2>
      </div>

      {recipes.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground space-y-2">
            <ChefHat className="h-10 w-10 mx-auto opacity-50" />
            <p>Todavía no has guardado ninguna receta.</p>
            <p className="text-sm">
              Cuando registres una comida con varios ingredientes podrás guardarla aquí.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {recipes.map((r) => (
            <Card key={r.id} className="cursor-pointer hover:bg-secondary/40" onClick={() => setOpen(r)}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{r.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {Math.round(r.kcal)} kcal · {new Date(r.savedAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Eliminar receta"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(r.id)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-md">
          {open && (
            <>
              <DialogHeader>
                <DialogTitle>{open.name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                <p className="text-sm text-muted-foreground">{Math.round(open.kcal)} kcal</p>
                {open.ingredients.length > 0 && (
                  <div>
                    <p className="font-semibold text-sm mb-1">Ingredientes</p>
                    <ul className="list-disc list-inside text-sm space-y-0.5">
                      {open.ingredients.map((i, idx) => (
                        <li key={idx}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {open.steps.length > 0 && (
                  <div>
                    <p className="font-semibold text-sm mb-1">Pasos</p>
                    <ol className="list-decimal list-inside text-sm space-y-1">
                      {open.steps.map((s, idx) => (
                        <li key={idx}>{s}</li>
                      ))}
                    </ol>
                  </div>
                )}
              </div>
              <Button variant="destructive" onClick={() => handleDelete(open.id)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Eliminar receta
              </Button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
