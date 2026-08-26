import { useEffect, useState } from "react";
import { X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MediaInspectorProps {
  element: HTMLElement;
  onChange: () => void;
  onClose: () => void;
  onDelete: () => void;
}

const BLEND_MODES = ["normal", "multiply", "overlay", "soft-light", "screen"];

// Reads/writes the live DOM node directly (the wrapper div + its media child + overlay div
// created in lib/media.ts buildMediaHtml). No React state mirrors the style — the DOM node
// IS the source of truth, then onChange() triggers the debounced autosave in Editor.tsx.
export default function MediaInspector({ element, onChange, onDelete, onClose }: MediaInspectorProps) {
  const media = element.querySelector("img, video") as HTMLElement | null;
  const overlay = element.querySelector(".uwe-media-overlay") as HTMLElement | null;

  const [width, setWidth] = useState(element.offsetWidth);
  const [opacity, setOpacity] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [gradientEnabled, setGradientEnabled] = useState(false);
  const [color1, setColor1] = useState("#2563eb");
  const [color2, setColor2] = useState("#f97316");
  const [angle, setAngle] = useState(135);
  const [blend, setBlend] = useState("multiply");

  useEffect(() => {
    setWidth(element.offsetWidth);
    if (media) {
      const style = media.style;
      setOpacity(style.opacity ? Math.round(parseFloat(style.opacity) * 100) : 100);
      const match = /brightness\((\d+)%\)/.exec(style.filter || "");
      setBrightness(match ? Number(match[1]) : 100);
    }
    if (overlay) {
      const bg = overlay.style.background;
      setGradientEnabled(!!bg && bg !== "transparent" && bg !== "");
      setBlend(overlay.style.mixBlendMode || "multiply");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element]);

  function applyWidth(px: number) {
    setWidth(px);
    element.style.width = `${px}px`;
    onChange();
  }

  function applyOpacity(pct: number) {
    setOpacity(pct);
    if (media) media.style.opacity = String(pct / 100);
    onChange();
  }

  function applyBrightness(pct: number) {
    setBrightness(pct);
    if (media) media.style.filter = `brightness(${pct}%)`;
    onChange();
  }

  function applyGradient(enabled: boolean, c1: string, c2: string, ang: number, mode: string) {
    if (!overlay) return;
    if (enabled) {
      overlay.style.background = `linear-gradient(${ang}deg, ${c1}, ${c2})`;
      overlay.style.mixBlendMode = mode as never;
      overlay.style.opacity = "0.55";
    } else {
      overlay.style.background = "transparent";
    }
    onChange();
  }

  return (
    <div
      data-testid="media-inspector-panel"
      className="absolute right-4 top-20 z-20 w-72 rounded-xl border border-border bg-card/95 p-4 shadow-2xl backdrop-blur-md"
    >
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-semibold">Editar mídia</h4>
        <Button data-testid="media-inspector-close" variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Largura ({width}px)</label>
          <input
            data-testid="media-width-slider"
            type="range"
            min={60}
            max={800}
            value={width}
            onChange={(e) => applyWidth(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Transparência ({opacity}%)</label>
          <input
            data-testid="media-opacity-slider"
            type="range"
            min={0}
            max={100}
            value={opacity}
            onChange={(e) => applyOpacity(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Exposição ({brightness}%)</label>
          <input
            data-testid="media-brightness-slider"
            type="range"
            min={20}
            max={200}
            value={brightness}
            onChange={(e) => applyBrightness(Number(e.target.value))}
            className="w-full accent-primary"
          />
        </div>

        {overlay && (
          <div className="rounded-lg border border-border p-3">
            <label className="mb-2 flex items-center gap-2 text-xs font-medium">
              <input
                data-testid="media-gradient-toggle"
                type="checkbox"
                checked={gradientEnabled}
                onChange={(e) => {
                  setGradientEnabled(e.target.checked);
                  applyGradient(e.target.checked, color1, color2, angle, blend);
                }}
              />
              Degradê / overlay
            </label>
            {gradientEnabled && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    data-testid="media-gradient-color1"
                    type="color"
                    value={color1}
                    onChange={(e) => {
                      setColor1(e.target.value);
                      applyGradient(true, e.target.value, color2, angle, blend);
                    }}
                    className="size-7 cursor-pointer rounded"
                  />
                  <input
                    data-testid="media-gradient-color2"
                    type="color"
                    value={color2}
                    onChange={(e) => {
                      setColor2(e.target.value);
                      applyGradient(true, color1, e.target.value, angle, blend);
                    }}
                    className="size-7 cursor-pointer rounded"
                  />
                  <select
                    data-testid="media-gradient-blend"
                    value={blend}
                    onChange={(e) => {
                      setBlend(e.target.value);
                      applyGradient(true, color1, color2, angle, e.target.value);
                    }}
                    className="flex-1 rounded-md border border-input bg-background px-1.5 py-1 text-xs"
                  >
                    {BLEND_MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  data-testid="media-gradient-angle"
                  type="range"
                  min={0}
                  max={360}
                  value={angle}
                  onChange={(e) => {
                    setAngle(Number(e.target.value));
                    applyGradient(true, color1, color2, Number(e.target.value), blend);
                  }}
                  className="w-full accent-primary"
                />
              </div>
            )}
          </div>
        )}

        <Button
          data-testid="media-delete-button"
          variant="destructive"
          size="sm"
          className="w-full gap-1.5"
          onClick={onDelete}
        >
          <Trash2 className="size-3.5" /> Remover mídia
        </Button>
      </div>
    </div>
  );
}
