import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { History, Eye, RotateCcw } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { UweDocument, VersionSummary, VersionDetail } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface VersionHistoryDialogProps {
  documentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canRestore: boolean;
  onRestored: (doc: UweDocument) => void;
}

function formatWhen(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });
}

export function VersionHistoryDialog({
  documentId,
  open,
  onOpenChange,
  canRestore,
  onRestored,
}: VersionHistoryDialogProps) {
  const queryClient = useQueryClient();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const { data: versions, isLoading } = useQuery({
    queryKey: ["versions", documentId],
    queryFn: () => apiGet<VersionSummary[]>(`/documents/${documentId}/versions`),
    enabled: open,
  });

  const { data: preview, isLoading: previewLoading } = useQuery({
    queryKey: ["version-detail", documentId, previewId],
    queryFn: () => apiGet<VersionDetail>(`/documents/${documentId}/versions/${previewId}`),
    enabled: open && !!previewId,
  });

  const restoreMutation = useMutation({
    mutationFn: (versionId: string) =>
      apiPost<UweDocument>(`/documents/${documentId}/versions/${versionId}/restore`, {}),
    onSuccess: (doc) => {
      onRestored(doc);
      queryClient.invalidateQueries({ queryKey: ["versions", documentId] });
      setConfirmingId(null);
      setPreviewId(null);
      toast.success("Versão restaurada");
      onOpenChange(false);
    },
    onError: () => toast.error("Não foi possível restaurar essa versão"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" /> Histórico de versões
          </DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 gap-4">
          <div className="flex w-56 shrink-0 flex-col gap-1 overflow-y-auto" data-testid="version-list">
            {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
            {versions?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhuma versão salva ainda. Uma nova versão é guardada a cada poucos
                minutos de edição.
              </p>
            )}
            {versions?.map((v) => (
              <button
                key={v.id}
                data-testid={`version-item-${v.id}`}
                onClick={() => setPreviewId(v.id)}
                className={`flex flex-col items-start rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted ${
                  previewId === v.id ? "bg-muted" : ""
                }`}
              >
                <span className="font-medium">{formatWhen(v.created_at)}</span>
                <span className="text-xs text-muted-foreground">por {v.created_by_name}</span>
              </button>
            ))}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-3 border-l border-border pl-4">
            {!previewId && (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                <Eye className="mr-2 size-4" /> Selecione uma versão para visualizar
              </div>
            )}
            {previewId && previewLoading && (
              <p className="text-sm text-muted-foreground">Carregando prévia...</p>
            )}
            {previewId && preview && (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border bg-white p-4 text-[13px]">
                  <p className="mb-2 font-heading text-base font-semibold">{preview.title}</p>
                  <div
                    className="uwe-canvas"
                    // Same trust model as the editor/dashboard thumbnails elsewhere —
                    // this is the app's own authored content, not external HTML.
                    dangerouslySetInnerHTML={{ __html: preview.content_html }}
                  />
                </div>
                {canRestore && (
                  <div className="flex items-center justify-end gap-2">
                    {confirmingId === preview.id ? (
                      <>
                        <span className="text-sm text-muted-foreground">
                          Substituir o conteúdo atual por esta versão?
                        </span>
                        <Button variant="outline" size="sm" onClick={() => setConfirmingId(null)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          data-testid="version-restore-confirm"
                          disabled={restoreMutation.isPending}
                          onClick={() => restoreMutation.mutate(preview.id)}
                        >
                          Confirmar restauração
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        data-testid="version-restore-button"
                        onClick={() => setConfirmingId(preview.id)}
                      >
                        <RotateCcw className="size-3.5" /> Restaurar esta versão
                      </Button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
