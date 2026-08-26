import { useState } from "react";
import { Search, ImageIcon, NotebookText, ExternalLink, Link as LinkIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { htmlToMarkdown, downloadTextFile } from "@/lib/exportDoc";
import { toast } from "sonner";

interface AssistantSidebarProps {
  onInsertImageUrl: (url: string) => void;
  getDocTitle: () => string;
  getDocHtml: () => string;
}

export default function AssistantSidebar({ onInsertImageUrl, getDocTitle, getDocHtml }: AssistantSidebarProps) {
  const [webQuery, setWebQuery] = useState("");
  const [imgQuery, setImgQuery] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  function openGoogle(query: string, images: boolean) {
    if (!query.trim()) return;
    const base = "https://www.google.com/search?q=" + encodeURIComponent(query);
    window.open(images ? `${base}&tbm=isch` : base, "_blank", "noopener,noreferrer");
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border bg-card px-4 py-5" data-testid="assistant-sidebar">
      <Tabs defaultValue="web">
        <TabsList className="w-full">
          <TabsTrigger data-testid="assistant-tab-web" value="web" className="flex-1">
            <Search className="mr-1 size-3.5" /> Web
          </TabsTrigger>
          <TabsTrigger data-testid="assistant-tab-images" value="images" className="flex-1">
            <ImageIcon className="mr-1 size-3.5" /> Imagens
          </TabsTrigger>
          <TabsTrigger data-testid="assistant-tab-notebooklm" value="notebooklm" className="flex-1">
            <NotebookText className="mr-1 size-3.5" /> LM
          </TabsTrigger>
        </TabsList>

        <TabsContent value="web" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">Pesquise na Web e abra os resultados do Google em uma nova aba.</p>
          <Input
            data-testid="assistant-web-search-input"
            placeholder="Pesquisar no Google..."
            value={webQuery}
            onChange={(e) => setWebQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openGoogle(webQuery, false)}
          />
          <Button
            data-testid="assistant-web-search-button"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => openGoogle(webQuery, false)}
          >
            <ExternalLink className="size-3.5" /> Pesquisar no Google
          </Button>
        </TabsContent>

        <TabsContent value="images" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Pesquise no Google Imagens em nova aba, depois cole o link da imagem abaixo para inserir no documento.
          </p>
          <Input
            data-testid="assistant-images-search-input"
            placeholder="Pesquisar no Google Imagens..."
            value={imgQuery}
            onChange={(e) => setImgQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && openGoogle(imgQuery, true)}
          />
          <Button
            data-testid="assistant-images-search-button"
            size="sm"
            variant="outline"
            className="w-full gap-1.5"
            onClick={() => openGoogle(imgQuery, true)}
          >
            <ExternalLink className="size-3.5" /> Abrir Google Imagens
          </Button>

          <div
            className="mt-2 rounded-lg border-2 border-dashed border-border p-4 text-center text-xs text-muted-foreground"
            data-testid="assistant-image-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const url = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
              if (url) onInsertImageUrl(url);
            }}
          >
            Arraste uma imagem aqui, ou cole a URL abaixo
          </div>
          <div className="flex gap-1.5">
            <Input
              data-testid="assistant-image-url-input"
              placeholder="https://... (URL da imagem)"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <Button
              data-testid="assistant-image-url-insert"
              size="icon-sm"
              variant="outline"
              onClick={() => {
                if (!imageUrl.trim()) return;
                onInsertImageUrl(imageUrl.trim());
                setImageUrl("");
              }}
            >
              <LinkIcon className="size-4" />
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="notebooklm" className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Exporte o conteúdo do documento como Markdown para usar como fonte no NotebookLM.
          </p>
          <Button
            data-testid="notebooklm-copy-button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={async () => {
              const md = htmlToMarkdown(getDocHtml());
              await navigator.clipboard.writeText(md);
              toast.success("Markdown copiado para a área de transferência");
            }}
          >
            Copiar como Markdown
          </Button>
          <Button
            data-testid="notebooklm-download-button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              const md = htmlToMarkdown(getDocHtml());
              downloadTextFile(`${getDocTitle() || "documento"}.md`, md);
              toast.success("Arquivo .md baixado");
            }}
          >
            Baixar arquivo .md
          </Button>
          <Button
            data-testid="notebooklm-open-button"
            size="sm"
            className="w-full gap-1.5"
            onClick={() => window.open("https://notebooklm.google.com", "_blank", "noopener,noreferrer")}
          >
            <ExternalLink className="size-3.5" /> Abrir NotebookLM
          </Button>
        </TabsContent>
      </Tabs>
    </aside>
  );
}
