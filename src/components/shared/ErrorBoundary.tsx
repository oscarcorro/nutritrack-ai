import { Component, type ErrorInfo, type ReactNode } from "react"
import { Button } from "@/components/ui/button"

type Props = {
  children: ReactNode
}

type State = {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to console so devs can inspect; avoid throwing again here.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? "Error desconocido"
      return (
        <div
          role="alert"
          className="min-h-svh flex items-center justify-center px-4 py-8 bg-background"
        >
          <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-card">
            <h1 className="text-2xl font-bold mb-2">Algo ha fallado</h1>
            <p className="text-sm text-muted-foreground mb-5">
              Ha ocurrido un error inesperado. Puedes reintentar para volver a cargar la pantalla.
            </p>
            <Button onClick={this.handleRetry} className="w-full" size="lg">
              Reintentar
            </Button>
            <details className="mt-4 text-left text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">Detalles técnicos</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words bg-secondary/60 rounded-md p-2">
                {message}
              </pre>
            </details>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default ErrorBoundary
