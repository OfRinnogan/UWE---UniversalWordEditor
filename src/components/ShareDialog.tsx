import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X, Users } from "lucide-react";
import { apiGet, apiPost, apiDelete, ApiError } from "@/lib/api";
import type { DocumentShare } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

interface ShareDialogProps {
  documentId: string;
  documentTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ROLE_LABEL: Record<DocumentShare["role"], string> = {
  viewer: "Pode visualizar",
  editor: "Pode editar",
};

export function ShareDialog({ documentId, documentTitle, open, onOpenChange }: ShareDialogProps) {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<DocumentShare["role"]>("viewer");
  const [error, setError] = useState<string | null>(null);

  const { data: shares, isLoading } = useQuery({
    queryKey: ["shares", documentId],
    queryFn: () => apiGet<DocumentShare[]>(`/documents/${documentId}/shares`),
    enabled: open,
  });

  const addMutation = useMutation({
    mutationFn: () => apiPost<DocumentShare>(`/documents/${documentId}/shares`, { email, role }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", documentId] });
      setEmail("");
      setError(null);
      toast.success("Acesso concedido");
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 404) {
        setError("Nenhum usuário do UWE encontrado com esse e-mail.");
      } else if (err instanceof ApiError && err.status === 422) {
        setError("Você já é o dono deste documento.");
      } else {
        setError("Não foi possível compartilhar. Tente novamente.");
      }
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ targetEmail, newRole }: { targetEmail: string; newRole: DocumentShare["role"] }) =>
      apiPost<DocumentShare>(`/documents/${documentId}/shares`, { email: targetEmail, role: newRole }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", documentId] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: string) => apiDelete(`/documents/${documentId}/shares/${userId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shares", documentId] });
      toast.success("Acesso removido");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    addMutation.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4" /> Compartilhar "{documentTitle}"
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="share-email" className="mb-1 block text-xs font-medium text-muted-foreground">
              E-mail da pessoa
            </label>
            <Input
              id="share-email"
              data-testid="share-email-input"
              type="email"
              placeholder="nome@exemplo.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <Select value={role} onValueChange={(v) => setRole(v as DocumentShare["role"])}>
            <SelectTrigger size="sm" className="w-[150px]" data-testid="share-role-select">
              <SelectValue>{() => ROLE_LABEL[role]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Pode visualizar</SelectItem>
              <SelectItem value="editor">Pode editar</SelectItem>
            </SelectContent>
          </Select>

          <Button type="submit" data-testid="share-submit-button" disabled={addMutation.isPending}>
            Convidar
          </Button>
        </form>

        {error && (
          <p className="text-sm text-destructive" data-testid="share-error">
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-1" data-testid="share-list">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {shares?.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Ninguém mais tem acesso a este documento ainda.
            </p>
          )}
          {shares?.map((share) => (
            <div
              key={share.user_id}
              data-testid={`share-row-${share.user_id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{share.name}</p>
                <p className="truncate text-xs text-muted-foreground">{share.email}</p>
              </div>

              <Select
                value={share.role}
                onValueChange={(v) =>
                  changeRoleMutation.mutate({
                    targetEmail: share.email,
                    newRole: v as DocumentShare["role"],
                  })
                }
              >
                <SelectTrigger size="sm" className="w-[140px]">
                  <SelectValue>{() => ROLE_LABEL[share.role]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Pode visualizar</SelectItem>
                  <SelectItem value="editor">Pode editar</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant="ghost"
                size="icon-sm"
                data-testid={`share-remove-${share.user_id}`}
                onClick={() => removeMutation.mutate(share.user_id)}
                title="Remover acesso"
              >
                <X className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
