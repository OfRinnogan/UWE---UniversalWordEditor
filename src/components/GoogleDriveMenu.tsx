import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Cloud, CloudOff } from "lucide-react";
import { apiGet, apiDelete } from "@/lib/api";
import type { IntegrationStatus } from "@/lib/media";
import { startGoogleConnect } from "@/lib/googleDrive";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function GoogleDriveMenu() {
  const queryClient = useQueryClient();

  const { data: integrations } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => apiGet<IntegrationStatus[]>("/integrations"),
  });

  const google = integrations?.find((i) => i.provider === "google");

  const disconnectMutation = useMutation({
    mutationFn: () => apiDelete("/integrations/google"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["integrations"] });
      toast.success("Google Drive desconectado");
    },
  });

  async function handleConnect() {
    try {
      await startGoogleConnect();
    } catch {
      toast.error("Não foi possível iniciar a conexão com o Google Drive");
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            data-testid="google-drive-menu-trigger"
            variant="ghost"
            size="sm"
            className="gap-1.5 text-muted-foreground"
          >
            {google ? <Cloud className="size-4 text-emerald-600" /> : <CloudOff className="size-4" />}
            <span className="hidden sm:inline">Google Drive</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-64">
        {google ? (
          <>
            <div className="px-2 py-1.5 text-xs text-muted-foreground">
              Conectado{google.account_email ? ` como ${google.account_email}` : ""}
            </div>
            <DropdownMenuItem
              data-testid="google-drive-disconnect"
              variant="destructive"
              onClick={() => disconnectMutation.mutate()}
            >
              Desconectar
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem data-testid="google-drive-connect" onClick={handleConnect}>
            Conectar Google Drive
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
