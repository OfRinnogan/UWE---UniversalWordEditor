import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading, connectionError, token, retry } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  // The session check failed for a reason unrelated to the token itself (network
  // error, backend briefly unreachable, etc.) — don't bounce to login and force a
  // password re-entry over what might just be a connection blip; offer to retry.
  if (connectionError && token) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <p className="text-muted-foreground">Não foi possível conectar ao servidor.</p>
        <Button data-testid="auth-retry-button" onClick={retry}>
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
