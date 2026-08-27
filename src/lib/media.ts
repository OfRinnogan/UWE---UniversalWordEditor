// Hand-written TS mirrors of backend Pydantic models — keep in sync manually
// (backend/models/documents.py, backend/routers/media.py).

export interface UweDocument {
  id: string;
  title: string;
  content_html: string;
  global_font: string | null;
  created_at: string;
  updated_at: string;
  // What the current user can do with this document — "owner" always can;
  // "editor" can change content but not manage sharing or delete it;
  // "viewer" is read-only.
  role: "owner" | "editor" | "viewer";
  owner_name: string;
  owner_email: string;
}

export interface DocumentShare {
  user_id: string;
  email: string;
  name: string;
  role: "editor" | "viewer";
}

export interface MediaUploadResponse {
  url: string;
  filename: string;
  content_type: string;
}

export type MediaKind = "image" | "video" | "audio" | "pdf" | "file";

const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "svg", "bmp", "webp", "avif"];
const VIDEO_EXT = ["mp4", "webm", "mov", "mpeg", "mpg", "avi", "wmv", "flv"];
const AUDIO_EXT = ["mp3", "wav", "ogg", "aac", "flac", "m4a"];

export function detectMediaKind(filename: string, contentType: string): MediaKind {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (contentType.startsWith("image/") || IMAGE_EXT.includes(ext)) return "image";
  if (contentType.startsWith("video/") || VIDEO_EXT.includes(ext)) return "video";
  if (contentType.startsWith("audio/") || AUDIO_EXT.includes(ext)) return "audio";
  if (contentType === "application/pdf" || ext === "pdf") return "pdf";
  return "file";
}

// Builds the contentEditable-safe media block inserted via execCommand('insertHTML').
// Every media block is contenteditable="false" and carries a resize handle + an
// overlay div used for the gradient/opacity/exposure controls (see MediaInspector.tsx).
export function buildMediaHtml(url: string, filename: string, contentType: string): string {
  const kind = detectMediaKind(filename, contentType);
  const safeName = filename.replace(/[<>&"]/g, "");

  if (kind === "image") {
    return `<div class="uwe-media" data-media-type="image" contenteditable="false" style="position:relative;display:inline-block;width:360px;max-width:100%;margin:8px;vertical-align:top;">
<img src="${url}" alt="${safeName}" style="width:100%;display:block;border-radius:6px;opacity:1;filter:brightness(100%);" />
<div class="uwe-media-overlay" style="position:absolute;inset:0;border-radius:6px;pointer-events:none;background:transparent;mix-blend-mode:normal;"></div>
<div class="uwe-resize-handle" style="position:absolute;right:-5px;bottom:-5px;width:14px;height:14px;background:#2563eb;border:2px solid #ffffff;border-radius:4px;cursor:se-resize;"></div>
</div>&nbsp;`;
  }
  if (kind === "video") {
    return `<div class="uwe-media" data-media-type="video" contenteditable="false" style="position:relative;display:inline-block;width:420px;max-width:100%;margin:8px;vertical-align:top;">
<video src="${url}" controls style="width:100%;display:block;border-radius:6px;opacity:1;filter:brightness(100%);"></video>
<div class="uwe-media-overlay" style="position:absolute;inset:0;border-radius:6px;pointer-events:none;background:transparent;mix-blend-mode:normal;"></div>
<div class="uwe-resize-handle" style="position:absolute;right:-5px;bottom:-5px;width:14px;height:14px;background:#2563eb;border:2px solid #ffffff;border-radius:4px;cursor:se-resize;"></div>
</div>&nbsp;`;
  }
  if (kind === "audio") {
    return `<div class="uwe-media" data-media-type="audio" contenteditable="false" style="position:relative;display:block;width:340px;margin:8px 0;">
<audio src="${url}" controls style="width:100%;display:block;"></audio>
</div>`;
  }
  // pdf / generic file — a clickable card, since browsers can't render eps/pdf inline reliably
  const icon = kind === "pdf" ? "📄" : "📎";
  return `<div class="uwe-media" data-media-type="${kind}" contenteditable="false" style="display:block;width:fit-content;margin:8px 0;">
<a href="${url}" target="_blank" rel="noopener noreferrer" style="display:flex;align-items:center;gap:10px;padding:12px 16px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;text-decoration:none;color:#0f172a;font-size:14px;">${icon} ${safeName}</a>
</div>`;
}
