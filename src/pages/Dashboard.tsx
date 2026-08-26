import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, MoreVertical, Pencil, Copy, Trash2, Search, Sparkles } from "lucide-react";
import { apiGet, apiPost, apiPut, apiDelete } from "@/lib/api";
import type { UweDocument } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardFooter, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const fetchDocuments = () => apiGet<UweDocument[]>("/documents");

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// Live thumbnail: renders the document's real HTML at 25% scale (transform-origin
// top-left on a 4x-wide box) so the card shows an actual miniature of the first
// lines/media instead of a plain text snippet. Hoisted to module scope (not defined
// inside Dashboard) so oxlint's react/only-export-components rule stays happy.
function DocumentThumbnail({ docId, html }: { docId: string; html: string }) {
  return (
    <div
      data-testid={`document-thumbnail-${docId}`}
      className="relative h-36 w-full overflow-hidden rounded-t-xl border-b border-border bg-white"
    >
      {html ? (
        <div
          className="uwe-canvas origin-top-left p-4 text-[13px]"
          style={{ width: "400%", transform: "scale(0.25)", pointerEvents: "none" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Documento em branco
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white/90" />
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [renameTarget, setRenameTarget] = useState<UweDocument | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UweDocument | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["documents"], queryFn: fetchDocuments });

  const createMutation = useMutation({
    mutationFn: () => apiPost<UweDocument>("/documents", { title: "Documento sem título" }),
    onSuccess: (doc) => navigate(`/editor/${doc.id}`),
  });

  const renameMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      apiPut<UweDocument>(`/documents/${id}`, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setRenameTarget(null);
      toast.success("Documento renomeado");
    },
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => apiPost<UweDocument>(`/documents/${id}/duplicate`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Documento duplicado");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      setDeleteTarget(null);
      toast.success("Documento excluído");
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data;
    return data.filter((d) => d.title.toLowerCase().includes(q));
  }, [data, search]);

  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-card/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-5" />
            </div>
            <span className="font-heading text-lg font-bold tracking-tight">UWE</span>
            <span className="hidden text-sm text-muted-foreground sm:inline">Universal Word Editor</span>
          </div>
          <div className="relative ml-4 flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="dashboard-search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Pesquisar documentos..."
              className="pl-9"
            />
          </div>
          <Button
            data-testid="dashboard-new-document-button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            className="ml-auto gap-1.5"
          >
            <Plus className="size-4" /> Novo documento
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10">
        <h1 className="mb-6 font-heading text-2xl font-bold tracking-tight">Meus documentos</h1>

        {isLoading && <p className="text-muted-foreground">Carregando documentos...</p>}
        {error && <p className="text-destructive" data-testid="dashboard-error">Não foi possível carregar os documentos.</p>}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-24 text-center">
            <FileText className="mb-3 size-10 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum documento encontrado.</p>
            <Button className="mt-4 gap-1.5" onClick={() => createMutation.mutate()}>
              <Plus className="size-4" /> Criar meu primeiro documento
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4" data-testid="dashboard-documents-grid">
          {filtered.map((doc) => (
            <Card
              key={doc.id}
              data-testid={`document-card-${doc.id}`}
              className="group cursor-pointer gap-3 border-border p-0 transition-all duration-200 hover:border-primary/50 hover:shadow-lg"
              onClick={() => navigate(`/editor/${doc.id}`)}
            >
              <div className="relative">
                <DocumentThumbnail docId={doc.id} html={doc.content_html} />
                <div className="absolute right-2 top-2" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          data-testid={`document-menu-trigger-${doc.id}`}
                          variant="secondary"
                          size="icon-sm"
                          className="shadow-sm"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      }
                    />
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        data-testid={`document-rename-${doc.id}`}
                        onClick={() => {
                          setRenameTarget(doc);
                          setRenameValue(doc.title);
                        }}
                      >
                        <Pencil className="size-4" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid={`document-duplicate-${doc.id}`}
                        onClick={() => duplicateMutation.mutate(doc.id)}
                      >
                        <Copy className="size-4" /> Duplicar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        data-testid={`document-delete-${doc.id}`}
                        variant="destructive"
                        onClick={() => setDeleteTarget(doc)}
                      >
                        <Trash2 className="size-4" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <CardContent className="py-1">
                <div className="flex items-center gap-1.5">
                  <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                  <CardTitle className="line-clamp-1 text-base">{doc.title}</CardTitle>
                </div>
              </CardContent>
              <CardFooter className="text-xs text-muted-foreground">
                Editado em {formatDate(doc.updated_at)}
              </CardFooter>
            </Card>
          ))}
        </div>
      </main>

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renomear documento</DialogTitle>
          </DialogHeader>
          <Input
            data-testid="rename-document-input"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameTarget(null)}>
              Cancelar
            </Button>
            <Button
              data-testid="rename-document-confirm"
              onClick={() => renameTarget && renameMutation.mutate({ id: renameTarget.id, title: renameValue })}
              disabled={renameMutation.isPending || !renameValue.trim()}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir "{deleteTarget?.title}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Esta ação não pode ser desfeita.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancelar
            </Button>
            <Button
              data-testid="delete-document-confirm"
              variant="destructive"
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              disabled={deleteMutation.isPending}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
