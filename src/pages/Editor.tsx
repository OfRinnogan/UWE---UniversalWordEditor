import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronDown, Download, Loader2, PanelRight, Type } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { UweDocument } from "@/lib/media";
import { buildMediaHtml } from "@/lib/media";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import EditorToolbar from "@/components/editor/EditorToolbar";
import MediaSidebar from "@/components/editor/MediaSidebar";
import AssistantSidebar from "@/components/editor/AssistantSidebar";
import MediaInspector from "@/components/editor/MediaInspector";
import FindReplaceBar from "@/components/editor/FindReplaceBar";
import { FONT_OPTIONS } from "@/lib/fonts";
import { htmlToMarkdown, downloadTextFile } from "@/lib/exportDoc";
import { toast } from "sonner";

const fetchDocument = (id: string) => apiGet<UweDocument>(`/documents/${id}`);

type SaveStatus = "idle" | "saving" | "saved";

export default function Editor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRangeRef = useRef<Range | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedDocIdRef = useRef<string | null>(null);
  const titleRef = useRef("");

  const [title, setTitle] = useState("");
  const [globalFont, setGlobalFont] = useState<string | null>(null);
  const [showAssistant, setShowAssistant] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [selectedMedia, setSelectedMedia] = useState<HTMLElement | null>(null);

  // Find & Replace — matchElsRef holds the live <mark> wrappers created by runFindSearch.
  const findInputRef = useRef<HTMLInputElement>(null);
  const matchElsRef = useRef<HTMLElement[]>([]);
  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [matchCount, setMatchCount] = useState(0);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1);

  const { data, isLoading, error } = useQuery({
    queryKey: ["document", id],
    queryFn: () => fetchDocument(id as string),
    enabled: !!id,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: { title?: string; content_html?: string; global_font?: string | null }) =>
      apiPut<UweDocument>(`/documents/${id}`, payload),
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => setSaveStatus("saved"),
  });

  // Load doc content into the contentEditable exactly once per document id.
  useEffect(() => {
    if (data && loadedDocIdRef.current !== data.id) {
      setTitle(data.title);
      titleRef.current = data.title;
      setGlobalFont(data.global_font);
      if (editorRef.current) editorRef.current.innerHTML = data.content_html;
      loadedDocIdRef.current = data.id;
    }
  }, [data]);

  // Track selection inside the editor so sidebar inserts (which steal focus) can restore it.
  useEffect(() => {
    function onSelectionChange() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
      const range = sel.getRangeAt(0);
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        lastRangeRef.current = range.cloneRange();
      }
    }
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // Ctrl/Cmd+F opens the custom find bar from anywhere on the page (not just while the
  // canvas is focused) and replaces the browser's native find UI.
  useEffect(() => {
    function onWindowKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setShowFindBar(true);
      }
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, []);

  // Unwraps every <mark class="uwe-find-match"> back into plain text nodes.
  function clearFindHighlights() {
    const editor = editorRef.current;
    if (!editor) return;
    editor.querySelectorAll("mark.uwe-find-match").forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
      parent.removeChild(mark);
      parent.normalize();
    });
    matchElsRef.current = [];
  }

  function paintCurrentMatch(index: number) {
    matchElsRef.current.forEach((m, i) => {
      m.style.background = i === index ? "#f97316" : "#fde68a";
      m.style.color = i === index ? "#ffffff" : "inherit";
    });
    matchElsRef.current[index]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }

  // Wraps every case-insensitive occurrence of `query` inside the canvas in a <mark>,
  // skipping text inside media blocks. Rebuilds matchElsRef + counters from scratch.
  function runFindSearch(query: string) {
    clearFindHighlights();
    const editor = editorRef.current;
    if (!editor || !query.trim()) {
      setMatchCount(0);
      setCurrentMatchIndex(-1);
      return;
    }
    const lowerQuery = query.toLowerCase();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) =>
        (node.parentElement?.closest(".uwe-media")
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT),
    });
    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) textNodes.push(node as Text);

    const newMatches: HTMLElement[] = [];
    textNodes.forEach((textNode) => {
      const text = textNode.textContent || "";
      const lower = text.toLowerCase();
      if (!lower.includes(lowerQuery)) return;
      const frag = document.createDocumentFragment();
      let lastIndex = 0;
      let idx = lower.indexOf(lowerQuery);
      while (idx !== -1) {
        if (idx > lastIndex) frag.appendChild(document.createTextNode(text.slice(lastIndex, idx)));
        const mark = document.createElement("mark");
        mark.className = "uwe-find-match";
        mark.style.background = "#fde68a";
        mark.style.borderRadius = "2px";
        mark.textContent = text.slice(idx, idx + query.length);
        frag.appendChild(mark);
        newMatches.push(mark);
        lastIndex = idx + query.length;
        idx = lower.indexOf(lowerQuery, lastIndex);
      }
      if (lastIndex < text.length) frag.appendChild(document.createTextNode(text.slice(lastIndex)));
      textNode.parentNode?.replaceChild(frag, textNode);
    });

    matchElsRef.current = newMatches;
    setMatchCount(newMatches.length);
    const nextIndex = newMatches.length > 0 ? 0 : -1;
    setCurrentMatchIndex(nextIndex);
    if (nextIndex >= 0) paintCurrentMatch(nextIndex);
  }

  function handleFindQueryChange(value: string) {
    setFindQuery(value);
    runFindSearch(value);
  }

  function goToMatch(delta: number) {
    const total = matchElsRef.current.length;
    if (total === 0) return;
    const next = (currentMatchIndex + delta + total) % total;
    setCurrentMatchIndex(next);
    paintCurrentMatch(next);
  }

  function replaceCurrentMatch() {
    const el = matchElsRef.current[currentMatchIndex];
    if (!el) return;
    el.replaceWith(document.createTextNode(replaceQuery));
    editorRef.current?.normalize();
    scheduleSave();
    runFindSearch(findQuery);
  }

  function replaceAllMatches() {
    if (matchElsRef.current.length === 0) return;
    matchElsRef.current.forEach((el) => el.replaceWith(document.createTextNode(replaceQuery)));
    editorRef.current?.normalize();
    matchElsRef.current = [];
    setMatchCount(0);
    setCurrentMatchIndex(-1);
    scheduleSave();
  }

  function closeFindBar() {
    clearFindHighlights();
    setShowFindBar(false);
    setFindQuery("");
    setReplaceQuery("");
    setMatchCount(0);
    setCurrentMatchIndex(-1);
  }

  // Always includes the latest title (via titleRef) so a fast keystroke on the content
  // never clears a still-pending title save — every debounced save carries both.
  const scheduleSave = useCallback(
    (extra?: { global_font?: string | null }) => {
      setSaveStatus("saving");
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate({
          title: titleRef.current,
          content_html: editorRef.current?.innerHTML ?? "",
          ...extra,
        });
      }, 900);
    },
    [saveMutation]
  );

  function focusEditor() {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (lastRangeRef.current && sel) {
      sel.removeAllRanges();
      sel.addRange(lastRangeRef.current);
    }
  }

  function handleCommand(command: string, value?: string) {
    editorRef.current?.focus();
    if (command === "foreColor" || command === "hiliteColor") {
      document.execCommand("styleWithCSS", false, "true");
    }
    document.execCommand(command, false, value);
    scheduleSave();
  }

  function handleFontSize(px: number) {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      toast.info("Selecione um trecho de texto para aplicar o tamanho");
      return;
    }
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.style.fontSize = `${px}px`;
    span.appendChild(range.extractContents());
    range.insertNode(span);
    sel.removeAllRanges();
    scheduleSave();
  }

  function insertHtmlAtSelection(html: string) {
    focusEditor();
    document.execCommand("insertHTML", false, html);
    scheduleSave();
  }

  function insertImageUrl(url: string) {
    insertHtmlAtSelection(buildMediaHtml(url, url.split("/").pop() || "imagem", "image/*"));
  }

  function handleEditorMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("uwe-resize-handle")) {
      e.preventDefault();
      e.stopPropagation();
      const wrapper = target.closest(".uwe-media") as HTMLElement;
      if (!wrapper) return;
      const startX = e.clientX;
      const startWidth = wrapper.offsetWidth;
      function onMove(ev: MouseEvent) {
        const newWidth = Math.max(60, startWidth + (ev.clientX - startX));
        wrapper.style.width = `${newWidth}px`;
      }
      function onUp() {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        scheduleSave();
      }
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    }
  }

  function handleEditorClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const wrapper = target.closest(".uwe-media") as HTMLElement | null;
    document.querySelectorAll(".uwe-media-selected").forEach((el) => el.classList.remove("uwe-media-selected"));
    if (wrapper) {
      wrapper.classList.add("uwe-media-selected");
      setSelectedMedia(wrapper);
    } else {
      setSelectedMedia(null);
    }
  }

  // Ctrl/Cmd+B/I/U/Z/Y — most browsers already bold/italic/underline/undo/redo natively
  // inside a contentEditable, but intercepting here guarantees the autosave debounce
  // fires too (a native-only toggle never calls onInput in every browser).
  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === "b") {
      e.preventDefault();
      handleCommand("bold");
    } else if (key === "i") {
      e.preventDefault();
      handleCommand("italic");
    } else if (key === "u") {
      e.preventDefault();
      handleCommand("underline");
    } else if (key === "z") {
      e.preventDefault();
      handleCommand(e.shiftKey ? "redo" : "undo");
    } else if (key === "y") {
      e.preventDefault();
      handleCommand("redo");
    }
  }

  function handleDeleteSelectedMedia() {
    selectedMedia?.remove();
    setSelectedMedia(null);
    scheduleSave();
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    titleRef.current = value;
    scheduleSave();
  }

  function handleGlobalFontChange(value: string) {
    const next = value === "__none__" ? null : value;
    setGlobalFont(next);
    saveMutation.mutate(
      { title: titleRef.current, global_font: next },
      { onSuccess: () => setSaveStatus("saved") }
    );
  }

  if (isLoading) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3">
        <p className="text-destructive" data-testid="editor-error">
          Documento não encontrado.
        </p>
        <Button onClick={() => navigate("/")}>Voltar ao painel</Button>
      </div>
    );
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border bg-card px-4 py-2.5">
        <Button data-testid="editor-back-button" variant="ghost" size="icon-sm" onClick={() => navigate("/")}>
          <ArrowLeft className="size-4" />
        </Button>
        <Input
          data-testid="editor-title-input"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          className="h-8 max-w-xs border-none bg-transparent px-1 font-heading text-base font-semibold shadow-none focus-visible:ring-1"
        />
        <span className="flex items-center gap-1 text-xs text-muted-foreground" data-testid="editor-save-status">
          {saveStatus === "saving" ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Salvando...
            </>
          ) : (
            <>
              <Check className="size-3" /> Salvo
            </>
          )}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border border-input px-2 py-1">
            <Type className="size-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Fonte global</span>
            <Select
              value={globalFont ?? "__none__"}
              onValueChange={handleGlobalFontChange}
            >
              <SelectTrigger size="sm" className="h-6 w-[120px] border-none" data-testid="editor-global-font-select">
                <SelectValue>{(v) => (v === "__none__" ? "Desativada" : FONT_OPTIONS.find((f) => f.value === v)?.label ?? "Fonte")}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Desativada</SelectItem>
                {FONT_OPTIONS.map((f) => (
                  <SelectItem key={f.label} value={f.value}>
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button data-testid="editor-export-menu-trigger" variant="outline" size="sm" className="gap-1.5">
                  <Download className="size-3.5" /> Exportar <ChevronDown className="size-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                data-testid="editor-export-markdown"
                onClick={() => downloadTextFile(`${title || "documento"}.md`, htmlToMarkdown(editorRef.current?.innerHTML ?? ""))}
              >
                Baixar como Markdown (.md)
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid="editor-export-text"
                onClick={() => downloadTextFile(`${title || "documento"}.txt`, htmlToMarkdown(editorRef.current?.innerHTML ?? ""))}
              >
                Baixar como texto (.txt)
              </DropdownMenuItem>
              <DropdownMenuItem data-testid="editor-export-print" onClick={() => window.print()}>
                Imprimir / Salvar como PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            data-testid="editor-toggle-assistant"
            variant={showAssistant ? "secondary" : "outline"}
            size="icon-sm"
            onClick={() => setShowAssistant((v) => !v)}
            title="Painel Google / NotebookLM"
          >
            <PanelRight className="size-4" />
          </Button>
        </div>
      </header>

      <EditorToolbar onCommand={handleCommand} onFontSize={handleFontSize} globalFontActive={!!globalFont} />

      <div className="flex flex-1 overflow-hidden">
        <MediaSidebar onInsertHtml={insertHtmlAtSelection} />

        <main className="relative flex-1 overflow-y-auto bg-[#f4f5f7] px-6 py-10">
          <div className="mx-auto w-[816px] max-w-full">
            <div
              ref={editorRef}
              data-testid="document-canvas"
              contentEditable
              suppressContentEditableWarning
              className={`uwe-canvas min-h-[1056px] rounded-sm border border-border bg-white px-16 py-14 shadow-2xl ${
                globalFont ? "uwe-global-font-active" : ""
              }`}
              style={globalFont ? ({ ["--global-doc-font" as string]: globalFont } as React.CSSProperties) : undefined}
              onInput={() => scheduleSave()}
              onKeyDown={handleEditorKeyDown}
              onMouseDown={handleEditorMouseDown}
              onClick={handleEditorClick}
            />
          </div>

          {selectedMedia && (
            <MediaInspector
              element={selectedMedia}
              onChange={() => scheduleSave()}
              onDelete={handleDeleteSelectedMedia}
              onClose={() => {
                selectedMedia.classList.remove("uwe-media-selected");
                setSelectedMedia(null);
              }}
            />
          )}

          {showFindBar && (
            <FindReplaceBar
              inputRef={findInputRef}
              query={findQuery}
              onQueryChange={handleFindQueryChange}
              replacement={replaceQuery}
              onReplacementChange={setReplaceQuery}
              matchCount={matchCount}
              currentIndex={currentMatchIndex}
              onNext={() => goToMatch(1)}
              onPrev={() => goToMatch(-1)}
              onReplace={replaceCurrentMatch}
              onReplaceAll={replaceAllMatches}
              onClose={closeFindBar}
            />
          )}
        </main>

        {showAssistant && (
          <AssistantSidebar
            onInsertImageUrl={insertImageUrl}
            getDocTitle={() => title}
            getDocHtml={() => editorRef.current?.innerHTML ?? ""}
          />
        )}
      </div>
    </div>
  );
}
