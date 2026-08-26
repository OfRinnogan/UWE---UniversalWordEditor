import { useEffect, type RefObject } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface FindReplaceBarProps {
  inputRef: RefObject<HTMLInputElement | null>;
  query: string;
  onQueryChange: (value: string) => void;
  replacement: string;
  onReplacementChange: (value: string) => void;
  matchCount: number;
  currentIndex: number;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

// Floating bar opened by Ctrl/Cmd+F (see Editor.tsx) — replaces the browser's native
// find UI with one that can jump matches AND replace text inside the contentEditable.
export default function FindReplaceBar({
  inputRef,
  query,
  onQueryChange,
  replacement,
  onReplacementChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onClose,
}: FindReplaceBarProps) {
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [inputRef]);

  return (
    <div
      data-testid="find-replace-bar"
      className="absolute right-4 top-4 z-30 w-80 rounded-xl border border-border bg-card/95 p-3 shadow-2xl backdrop-blur-md"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center gap-1.5">
        <Input
          ref={inputRef}
          data-testid="find-input"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (e.shiftKey) {
                onPrev();
              } else {
                onNext();
              }
            }
          }}
          placeholder="Localizar no documento..."
          className="h-8 flex-1"
        />
        <span
          data-testid="find-match-count"
          className="w-12 shrink-0 text-center text-xs text-muted-foreground"
        >
          {matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : "0/0"}
        </span>
        <Button data-testid="find-prev-button" variant="ghost" size="icon-sm" onClick={onPrev} disabled={matchCount === 0}>
          <ChevronUp className="size-4" />
        </Button>
        <Button data-testid="find-next-button" variant="ghost" size="icon-sm" onClick={onNext} disabled={matchCount === 0}>
          <ChevronDown className="size-4" />
        </Button>
        <Button data-testid="find-close-button" variant="ghost" size="icon-sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="mt-2 flex items-center gap-1.5">
        <Input
          data-testid="replace-input"
          value={replacement}
          onChange={(e) => onReplacementChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onReplace();
            }
          }}
          placeholder="Substituir por..."
          className="h-8 flex-1"
        />
        <Button
          data-testid="replace-one-button"
          variant="outline"
          size="sm"
          onClick={onReplace}
          disabled={matchCount === 0}
        >
          Substituir
        </Button>
        <Button
          data-testid="replace-all-button"
          variant="outline"
          size="sm"
          onClick={onReplaceAll}
          disabled={matchCount === 0}
        >
          Tudo
        </Button>
      </div>
    </div>
  );
}
