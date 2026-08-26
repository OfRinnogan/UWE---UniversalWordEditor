import { useRef, useState } from "react";
import { Upload, Image as ImageIcon, Video, Music, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MediaUploadResponse } from "@/lib/media";
import { buildMediaHtml } from "@/lib/media";
import { toast } from "sonner";

interface MediaSidebarProps {
  onInsertHtml: (html: string) => void;
}

async function uploadFile(file: File): Promise<MediaUploadResponse> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/media/upload", { method: "POST", body: form });
  if (!res.ok) throw new Error("upload failed");
  return res.json();
}

export default function MediaSidebar({ onInsertHtml }: MediaSidebarProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState<MediaUploadResponse[]>([]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const uploaded = await uploadFile(file);
        onInsertHtml(buildMediaHtml(uploaded.url, uploaded.filename, uploaded.content_type));
        setRecent((prev) => [uploaded, ...prev].slice(0, 8));
      }
      toast.success("Mídia inserida no documento");
    } catch {
      toast.error("Falha ao enviar arquivo");
    } finally {
      setUploading(false);
    }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-card px-4 py-5">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Inserir mídia</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Qualquer extensão: png, jpg, gif, svg, bmp, eps, pdf, mp4, mp3...
        </p>
        <button
          type="button"
          data-testid="media-upload-dropzone"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            handleFiles(e.dataTransfer.files);
          }}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-3 py-6 text-center transition-colors hover:border-primary hover:bg-accent/40"
        >
          {uploading ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <Upload className="size-6 text-muted-foreground" />
          )}
          <span className="text-xs text-muted-foreground">Arraste um arquivo ou clique para enviar</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          data-testid="media-upload-input"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 text-muted-foreground">
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted py-2 text-[10px]">
          <ImageIcon className="size-4" /> Imagem
        </div>
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted py-2 text-[10px]">
          <Video className="size-4" /> Vídeo
        </div>
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted py-2 text-[10px]">
          <Music className="size-4" /> Áudio
        </div>
        <div className="flex flex-col items-center gap-1 rounded-md bg-muted py-2 text-[10px]">
          <FileText className="size-4" /> PDF
        </div>
      </div>

      {recent.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold text-muted-foreground">Enviados recentemente</h4>
          <ul className="space-y-1.5" data-testid="media-recent-list">
            {recent.map((r) => (
              <li key={r.url} className="truncate rounded-md bg-muted px-2 py-1.5 text-xs text-muted-foreground">
                {r.filename}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button
        data-testid="media-insert-shape-divider"
        variant="outline"
        size="sm"
        onClick={() =>
          onInsertHtml(
            '<hr style="border:none;border-top:2px solid #e2e8f0;margin:16px 0;" />'
          )
        }
      >
        Inserir divisor
      </Button>
    </aside>
  );
}
