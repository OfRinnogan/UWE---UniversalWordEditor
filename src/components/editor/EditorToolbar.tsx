import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  List,
  ListOrdered,
  Link2,
  Undo2,
  Redo2,
  Palette,
  Highlighter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FONT_OPTIONS, FONT_SIZE_OPTIONS } from "@/lib/fonts";

interface EditorToolbarProps {
  onCommand: (command: string, value?: string) => void;
  onFontSize: (px: number) => void;
  globalFontActive: boolean;
}

const HEADING_OPTIONS = [
  { value: "P", label: "Parágrafo" },
  { value: "H1", label: "Título 1" },
  { value: "H2", label: "Título 2" },
  { value: "H3", label: "Título 3" },
  { value: "BLOCKQUOTE", label: "Citação" },
];

// onMouseDown preventDefault keeps the current text selection alive so execCommand
// still has something to act on — clicking a toolbar button never steals focus.
function toolBtnProps(onCommand: () => void) {
  return {
    onMouseDown: (e: React.MouseEvent) => e.preventDefault(),
    onClick: onCommand,
  };
}

export default function EditorToolbar({ onCommand, onFontSize, globalFontActive }: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-card px-4 py-2">
      <Button data-testid="toolbar-undo" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("undo"))}>
        <Undo2 className="size-4" />
      </Button>
      <Button data-testid="toolbar-redo" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("redo"))}>
        <Redo2 className="size-4" />
      </Button>

      <div className="mx-1.5 h-6 w-px bg-border" />

      <Select onValueChange={(v) => onCommand("formatBlock", `<${v}>`)}>
        <SelectTrigger size="sm" className="w-[130px]" data-testid="toolbar-heading-select">
          <SelectValue>{() => "Estilo"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {HEADING_OPTIONS.map((h) => (
            <SelectItem key={h.value} value={h.value}>
              {h.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        onValueChange={(v) => onCommand("fontName", v)}
        disabled={globalFontActive}
      >
        <SelectTrigger
          size="sm"
          className="w-[150px]"
          data-testid="toolbar-font-select"
          title={globalFontActive ? "Desative a Fonte Global para escolher fontes por trecho" : undefined}
        >
          <SelectValue>{() => "Fonte"}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map((f) => (
            <SelectItem key={f.label} value={f.value}>
              {f.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select onValueChange={(v) => onFontSize(Number(v))}>
        <SelectTrigger size="sm" className="w-[90px]" data-testid="toolbar-fontsize-select">
          <SelectValue>{() => "Tam."}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZE_OPTIONS.map((s) => (
            <SelectItem key={s} value={String(s)}>
              {s}px
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="mx-1.5 h-6 w-px bg-border" />

      <Button data-testid="toolbar-bold" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("bold"))}>
        <Bold className="size-4" />
      </Button>
      <Button data-testid="toolbar-italic" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("italic"))}>
        <Italic className="size-4" />
      </Button>
      <Button data-testid="toolbar-underline" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("underline"))}>
        <Underline className="size-4" />
      </Button>
      <Button
        data-testid="toolbar-strikethrough"
        variant="ghost"
        size="icon-sm"
        {...toolBtnProps(() => onCommand("strikeThrough"))}
      >
        <Strikethrough className="size-4" />
      </Button>

      <label
        data-testid="toolbar-text-color"
        className="relative flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
        title="Cor do texto"
      >
        <Palette className="size-4" />
        <input
          type="color"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onCommand("foreColor", e.target.value)}
        />
      </label>
      <label
        data-testid="toolbar-highlight-color"
        className="relative flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
        title="Realce"
      >
        <Highlighter className="size-4" />
        <input
          type="color"
          className="absolute inset-0 size-full cursor-pointer opacity-0"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => onCommand("hiliteColor", e.target.value)}
        />
      </label>

      <div className="mx-1.5 h-6 w-px bg-border" />

      <Button data-testid="toolbar-align-left" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("justifyLeft"))}>
        <AlignLeft className="size-4" />
      </Button>
      <Button data-testid="toolbar-align-center" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("justifyCenter"))}>
        <AlignCenter className="size-4" />
      </Button>
      <Button data-testid="toolbar-align-right" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("justifyRight"))}>
        <AlignRight className="size-4" />
      </Button>
      <Button data-testid="toolbar-align-justify" variant="ghost" size="icon-sm" {...toolBtnProps(() => onCommand("justifyFull"))}>
        <AlignJustify className="size-4" />
      </Button>

      <div className="mx-1.5 h-6 w-px bg-border" />

      <Button
        data-testid="toolbar-list-bullet"
        variant="ghost"
        size="icon-sm"
        {...toolBtnProps(() => onCommand("insertUnorderedList"))}
      >
        <List className="size-4" />
      </Button>
      <Button
        data-testid="toolbar-list-ordered"
        variant="ghost"
        size="icon-sm"
        {...toolBtnProps(() => onCommand("insertOrderedList"))}
      >
        <ListOrdered className="size-4" />
      </Button>
      <Button
        data-testid="toolbar-link"
        variant="ghost"
        size="icon-sm"
        {...toolBtnProps(() => {
          const url = window.prompt("Endereço do link:", "https://");
          if (url) onCommand("createLink", url);
        })}
      >
        <Link2 className="size-4" />
      </Button>
    </div>
  );
}
