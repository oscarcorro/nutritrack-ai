import { useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { supabase } from "@/integrations/supabase/client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { toast } from "sonner"
import { Loader2, Leaf } from "lucide-react"

export default function AuthPage() {
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Login state
  const [loginEmail, setLoginEmail] = useState("")
  const [loginPassword, setLoginPassword] = useState("")

  // Signup state
  const [signupEmail, setSignupEmail] = useState("")
  const [signupPassword, setSignupPassword] = useState("")
  const [signupName, setSignupName] = useState("")

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-svh">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    )
  }

  if (user) {
    return <Navigate to="/inicio" replace />
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!loginEmail || !loginPassword) {
      toast.error("Completa todos los campos")
      return
    }
    setIsSubmitting(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: loginEmail,
      password: loginPassword,
    })
    setIsSubmitting(false)
    if (error) {
      toast.error("Error al iniciar sesion: " + error.message)
    } else {
      toast.success("Bienvenido de vuelta")
    }
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!signupEmail || !signupPassword || !signupName) {
      toast.error("Completa todos los campos")
      return
    }
    if (signupPassword.length < 6) {
      toast.error("La contrasena debe tener al menos 6 caracteres")
      return
    }
    setIsSubmitting(true)
    const { data: signupData, error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPassword,
      options: {
        data: { display_name: signupName },
      },
    })
    setIsSubmitting(false)
    if (error) {
      toast.error("Error al crear cuenta: " + error.message)
      return
    }
    // With email auto-confirm enabled server-side, signUp returns an active
    // session. If for any reason it doesn't, sign in explicitly so the user
    // lands on onboarding already logged in.
    if (!signupData.session) {
      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: signupEmail,
        password: signupPassword,
      })
      if (signInErr) {
        toast.error("Cuenta creada pero no se pudo iniciar sesion: " + signInErr.message)
        return
      }
    }
    toast.success("Cuenta creada correctamente")
    navigate("/onboarding", { replace: true })
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-svh px-4 bg-background">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-primary mb-3">
          <Leaf className="h-9 w-9 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold text-primary">NutriTrack</h1>
        <p className="text-muted-foreground text-base mt-1">Tu salud, simplificada</p>
      </div>

      <Card className="w-full max-w-sm">
        <CardHeader className="pb-2">
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="w-full">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="signup">Crear cuenta</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <CardContent className="p-0 pt-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-email">Email</Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="login-password">Contrasena</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Tu contrasena"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      autoComplete="current-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Entrar"}
                  </Button>
                </form>
              </CardContent>
            </TabsContent>

            <TabsContent value="signup">
              <CardContent className="p-0 pt-4">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Nombre</Label>
                    <Input
                      id="signup-name"
                      type="text"
                      placeholder="Tu nombre"
                      value={signupName}
                      onChange={(e) => setSignupName(e.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input
                      id="signup-email"
                      type="email"
                      placeholder="tu@email.com"
                      value={signupEmail}
                      onChange={(e) => setSignupEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Contrasena</Label>
                    <Input
                      id="signup-password"
                      type="password"
                      placeholder="Minimo 6 caracteres"
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={isSubmitting}>
                    {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : "Crear cuenta"}
                  </Button>
                </form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </CardHeader>
      </Card>
    </div>
  )
}
