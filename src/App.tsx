import {
  Check,
  Clipboard,
  Copy,
  Download,
  Eye,
  FileText,
  Loader2,
  Maximize2,
  Menu,
  Minus,
  PanelLeft,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
  lazy,
  Suspense,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  downloadRenderedHtml,
  downloadRenderedPdf,
  downloadRenderedWord,
} from "./exporters";
import { sampleRecord } from "./sample";
import { defaultSettings, readSettings, writeSettings } from "./settings";
import {
  cleanupRecords,
  clearRecords,
  deleteRecord,
  getRecords,
  saveRecord,
} from "./storage";
import type {
  FontChoice,
  MarkdownRecord,
  ReaderSettings,
  RetentionChoice,
  SourceMode,
  ThemeChoice,
  WidthChoice,
} from "./types";
import {
  countReadableTokens,
  createRecordId,
  downloadTextFile,
  estimateBytes,
  formatBytes,
  formatRelativeTime,
  makeDocumentTitle,
  retentionPolicies,
} from "./utils";

const MarkdownPreview = lazy(() =>
  import("./MarkdownPreview").then((module) => ({
    default: module.MarkdownPreview,
  })),
);

const themeOptions: Array<{ value: ThemeChoice; label: string }> = [
  { value: "day", label: "白天" },
  { value: "night", label: "深色" },
  { value: "sage", label: "护眼" },
];

const fontOptions: Array<{ value: FontChoice; label: string }> = [
  { value: "system", label: "系统" },
  { value: "serif", label: "衬线" },
  { value: "song", label: "宋体" },
  { value: "mono", label: "等宽" },
];

const widthOptions: Array<{ value: WidthChoice; label: string }> = [
  { value: "narrow", label: "64ch" },
  { value: "comfort", label: "78ch" },
  { value: "wide", label: "96ch" },
  { value: "full", label: "全宽" },
];

const retentionOptions: Array<{ value: RetentionChoice; label: string }> = [
  { value: "balanced", label: "均衡" },
  { value: "compact", label: "轻量" },
  { value: "archive", label: "归档" },
];

type ActiveExportKind = "pdf" | "word";
type ExportExtension = "docx" | "html" | "pdf";
type ZoomControlVariant = "panel" | "preview";

function buildRecord(
  base: MarkdownRecord | undefined,
  title: string,
  content: string,
  origin: MarkdownRecord["origin"],
  fileName?: string,
): MarkdownRecord {
  const now = Date.now();
  return {
    id: base?.id && base.id !== "sample" ? base.id : createRecordId(),
    title: title.trim() || makeDocumentTitle(fileName, content),
    content,
    origin,
    fileName: fileName ?? base?.fileName,
    createdAt: base?.id && base.id !== "sample" ? base.createdAt : now,
    updatedAt: now,
    sizeBytes: estimateBytes(content),
    wordCount: countReadableTokens(content),
  };
}

function safeFileName(title: string, extension: string) {
  const safe = title
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 72);
  return `${safe || "marklens-document"}.${extension}`;
}

interface ZoomControlsProps {
  onChange: (value: number) => void;
  value: number;
  variant: ZoomControlVariant;
}

function ZoomControls({ onChange, value, variant }: ZoomControlsProps) {
  const isPanel = variant === "panel";
  const testIdPrefix = isPanel ? "panel-" : "";
  const sliderLabel = isPanel ? "阅读缩放" : "预览缩放";
  const shrinkTitle = isPanel ? "缩小阅读字号" : "缩小预览";
  const growTitle = isPanel ? "放大阅读字号" : "放大预览";
  const resetTitle = isPanel ? "重置阅读缩放" : "重置缩放";
  const sliderClassName = isPanel ? "zoom-slider reader-zoom" : "zoom-slider";

  return (
    <>
      <button
        className="icon-only"
        onClick={() => onChange(value - 10)}
        title={shrinkTitle}
        data-testid={`${testIdPrefix}zoom-out-button`}
      >
        <Minus size={15} />
      </button>
      <label className={sliderClassName} title={sliderLabel}>
        <span>{value}%</span>
        <input
          aria-label={sliderLabel}
          data-testid={`${testIdPrefix}zoom-slider`}
          type="range"
          min="70"
          max="180"
          step="5"
          value={value}
          onInput={(event) => onChange(Number(event.currentTarget.value))}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <button
        className="icon-only"
        onClick={() => onChange(value + 10)}
        title={growTitle}
        data-testid={`${testIdPrefix}zoom-in-button`}
      >
        <Plus size={15} />
      </button>
      <button
        className="icon-only"
        onClick={() => onChange(100)}
        title={resetTitle}
        data-testid={`${testIdPrefix}zoom-reset-button`}
      >
        <RotateCcw size={15} />
      </button>
    </>
  );
}

function App() {
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    if (typeof localStorage === "undefined") return defaultSettings;
    return readSettings();
  });
  const [sourceMode, setSourceMode] = useState<SourceMode>("paste");
  const [records, setRecords] = useState<MarkdownRecord[]>([]);
  const [activeRecord, setActiveRecord] =
    useState<MarkdownRecord>(sampleRecord);
  const [markdown, setMarkdown] = useState(sampleRecord.content);
  const [title, setTitle] = useState(sampleRecord.title);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("本地就绪");
  const [isDragging, setIsDragging] = useState(false);
  const [isReaderOpen, setIsReaderOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [editorSplit, setEditorSplit] = useState(48);
  const [activeExport, setActiveExport] = useState<ActiveExportKind | null>(
    null,
  );
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const readerPanelBodyRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const workspaceRef = useRef<HTMLElement>(null);
  const deferredMarkdown = useDeferredValue(markdown);
  const previewZoom = settings.previewZoom;

  const stats = useMemo(() => {
    const bytes = estimateBytes(markdown);

    return {
      bytes,
      words: countReadableTokens(markdown),
      chars: markdown.length,
      longDocument: bytes > 220 * 1024,
    };
  }, [markdown]);

  const filteredRecords = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return records;

    return records.filter((record) => {
      const haystack = `${record.title} ${record.fileName ?? ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [query, records]);

  const storageBytes = useMemo(
    () => records.reduce((total, record) => total + record.sizeBytes, 0),
    [records],
  );

  const retentionPolicy = retentionPolicies[settings.retention];
  const isExportBusy = activeExport !== null;

  const refreshRecords = useCallback(async () => {
    const nextRecords = await getRecords();
    setRecords(nextRecords);
    return nextRecords;
  }, []);

  const applySettings = useCallback((patch: Partial<ReaderSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  const updatePreviewZoom = useCallback(
    (value: number) => {
      const nextZoom = Math.min(180, Math.max(70, Math.round(value)));
      applySettings({ previewZoom: nextZoom });
    },
    [applySettings],
  );

  const updateEditorSplit = useCallback((value: number) => {
    setEditorSplit(Math.min(72, Math.max(28, Math.round(value))));
  }, []);

  const updateEditorSplitFromPointer = useCallback(
    (clientX: number) => {
      const workspace = workspaceRef.current;
      if (!workspace) return;

      const rect = workspace.getBoundingClientRect();
      const sidebarWidth =
        sidebarRef.current?.getBoundingClientRect().width ?? 0;
      const contentLeft = rect.left + sidebarWidth;
      const availableWidth = Math.max(1, rect.width - sidebarWidth - 8);
      updateEditorSplit(((clientX - contentLeft) / availableWidth) * 100);
    },
    [updateEditorSplit],
  );

  function startPaneResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    updateEditorSplitFromPointer(event.clientX);

    function handlePointerMove(pointerEvent: PointerEvent) {
      updateEditorSplitFromPointer(pointerEvent.clientX);
    }

    function handlePointerUp() {
      document.body.classList.remove("is-resizing-panes");
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    document.body.classList.add("is-resizing-panes");
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  const runCleanup = useCallback(
    async (mode: "auto" | "manual") => {
      const result = await cleanupRecords(retentionPolicies[settings.retention]);
      await refreshRecords();

      if (mode === "manual") {
        setStatus(
          result.deleted
            ? `已清理 ${result.deleted} 篇，释放 ${formatBytes(result.freedBytes)}`
            : "无需清理",
        );
      }
    },
    [refreshRecords, settings.retention],
  );

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.font = settings.font;
    writeSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!isReaderOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsReaderOpen(false);
      }
    }

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isReaderOpen]);

  useEffect(() => {
    let ignore = false;

    async function hydrate() {
      await runCleanup("auto");
      const nextRecords = await refreshRecords();
      if (ignore || nextRecords.length === 0) return;

      startTransition(() => {
        const latest = nextRecords[0];
        setActiveRecord(latest);
        setMarkdown(latest.content);
        setTitle(latest.title);
        setSourceMode(latest.origin === "upload" ? "upload" : "paste");
      });
    }

    hydrate().catch(() => setStatus("历史载入失败"));

    return () => {
      ignore = true;
    };
  }, [refreshRecords, runCleanup]);

  async function persistCurrent(origin: MarkdownRecord["origin"] = "paste") {
    if (!markdown.trim()) {
      setStatus("空文档未保存");
      return;
    }

    const nextRecord = buildRecord(activeRecord, title, markdown, origin);
    await saveRecord(nextRecord);
    setActiveRecord(nextRecord);
    setTitle(nextRecord.title);
    await runCleanup("auto");
    await refreshRecords();
    setStatus(`已保存：${nextRecord.title}`);
  }

  async function loadRecord(record: MarkdownRecord) {
    startTransition(() => {
      setActiveRecord(record);
      setMarkdown(record.content);
      setTitle(record.title);
      setSourceMode(record.origin === "upload" ? "upload" : "paste");
      setStatus(`已打开：${record.title}`);
    });
  }

  async function removeRecord(record: MarkdownRecord) {
    await deleteRecord(record.id);
    const nextRecords = await refreshRecords();

    if (activeRecord.id === record.id) {
      const nextActive = nextRecords[0] ?? sampleRecord;
      setActiveRecord(nextActive);
      setMarkdown(nextActive.content);
      setTitle(nextActive.title);
    }

    setStatus(`已删除：${record.title}`);
  }

  async function removeAllRecords() {
    await clearRecords();
    await refreshRecords();
    setActiveRecord(sampleRecord);
    setMarkdown(sampleRecord.content);
    setTitle(sampleRecord.title);
    setStatus("历史已清空");
  }

  async function ingestFile(file: File) {
    const content = await file.text();
    const nextRecord = buildRecord(
      undefined,
      makeDocumentTitle(file.name, content),
      content,
      "upload",
      file.name,
    );

    await saveRecord(nextRecord);
    setActiveRecord(nextRecord);
    setMarkdown(content);
    setTitle(nextRecord.title);
    setSourceMode("upload");
    await runCleanup("auto");
    await refreshRecords();
    setStatus(`已上传：${file.name}`);
  }

  function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    ingestFile(file).catch(() => setStatus("文件读取失败"));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    ingestFile(file).catch(() => setStatus("文件读取失败"));
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setStatus("Markdown 已复制");
  }

  function exportMarkdown() {
    downloadTextFile(
      safeFileName(title, "md"),
      markdown,
      "text/markdown;charset=utf-8",
    );
    setStatus("Markdown 已导出");
  }

  function createExportContext(extension: ExportExtension) {
    return {
      fileName: safeFileName(title, extension),
      font: settings.font,
      previewZoom,
      theme: settings.theme,
      title,
    };
  }

  function getRenderedArticle() {
    const panelArticle = readerPanelBodyRef.current?.querySelector(
      ".markdown-body",
    );
    const previewArticle = previewScrollRef.current?.querySelector(
      ".markdown-body",
    );
    const article = panelArticle ?? previewArticle;

    if (!(article instanceof HTMLElement)) {
      throw new Error("Rendered article is not ready");
    }

    return article;
  }

  function exportHtml() {
    try {
      downloadRenderedHtml(getRenderedArticle(), createExportContext("html"));
      setStatus("HTML 已导出");
    } catch {
      setStatus("预览尚未准备好，稍后再导出");
    }
  }

  async function exportWord() {
    try {
      setActiveExport("word");
      setStatus("Word 正在生成...");
      await downloadRenderedWord(getRenderedArticle(), createExportContext("docx"));
      setStatus("Word 已导出（.docx）");
    } catch (error) {
      console.error("Word export failed", error);
      setStatus("Word 导出失败");
    } finally {
      setActiveExport(null);
    }
  }

  async function exportPdf() {
    try {
      setActiveExport("pdf");
      setStatus(stats.longDocument ? "长文档 PDF 分页生成中..." : "PDF 生成中...");
      await downloadRenderedPdf(getRenderedArticle(), createExportContext("pdf"));
      setStatus("PDF 已导出");
    } catch (error) {
      console.error("PDF export failed", error);
      setStatus("PDF 导出失败");
    } finally {
      setActiveExport(null);
    }
  }

  function updateMarkdown(value: string) {
    setMarkdown(value);
    if (activeRecord.id === "sample") {
      setActiveRecord({ ...sampleRecord, content: value });
    }
  }

  const workspaceStyle = {
    "--editor-column": `${editorSplit}fr`,
    "--preview-column": `${100 - editorSplit}fr`,
    "--sidebar-width": isSidebarOpen ? "280px" : "64px",
  } as CSSProperties;

  return (
    <div className={`app-shell ${isSidebarOpen ? "" : "sidebar-collapsed"}`}>
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">M↓</div>
          <div>
            <h1>MarkLens</h1>
            <p>{status}</p>
          </div>
        </div>

        <div className="toolbar" aria-label="阅读设置">
          <div className="toolbar-group" aria-label="阅读外观">
            <label className="control">
              <Eye size={16} aria-hidden="true" />
              <span>背景</span>
              <select
                aria-label="背景"
                data-testid="theme-select"
                value={settings.theme}
                onChange={(event) =>
                  applySettings({ theme: event.target.value as ThemeChoice })
                }
              >
                {themeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="control">
              <span>Aa</span>
              <span>字体</span>
              <select
                aria-label="字体"
                data-testid="font-select"
                value={settings.font}
                onChange={(event) =>
                  applySettings({ font: event.target.value as FontChoice })
                }
              >
                {fontOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="control">
              <PanelLeft size={16} aria-hidden="true" />
              <span>宽度</span>
              <select
                aria-label="阅读宽度"
                data-testid="width-select"
                value={settings.width}
                onChange={(event) =>
                  applySettings({ width: event.target.value as WidthChoice })
                }
              >
                {widthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="toolbar-group" aria-label="文档操作">
            <button className="icon-button" onClick={copyMarkdown} title="复制 Markdown">
              <Copy size={17} />
              <span>复制</span>
            </button>
            <button
              className="icon-button"
              onClick={exportMarkdown}
              title="导出 Markdown"
              disabled={isExportBusy}
            >
              <Download size={17} />
              <span>MD</span>
            </button>
            <button
              className="icon-button"
              onClick={exportHtml}
              title="导出渲染 HTML"
              disabled={isExportBusy}
            >
              <Download size={17} />
              <span>HTML</span>
            </button>
            <button
              className="icon-button"
              onClick={exportPdf}
              title="导出渲染 PDF"
              data-testid="export-pdf-button"
              disabled={isExportBusy}
            >
              {activeExport === "pdf" ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <Download size={17} />
              )}
              <span>PDF</span>
            </button>
            <button
              className="icon-button"
              onClick={exportWord}
              title="导出可编辑 Word"
              data-testid="export-word-button"
              disabled={isExportBusy}
            >
              {activeExport === "word" ? (
                <Loader2 className="spin" size={17} />
              ) : (
                <FileText size={17} />
              )}
              <span>Word</span>
            </button>
            <button
              className="icon-button"
              onClick={() => window.print()}
              title="打印或另存 PDF"
              disabled={isExportBusy}
            >
              <Printer size={17} />
              <span>打印</span>
            </button>
          </div>
        </div>
      </header>

      <main className="workspace" ref={workspaceRef} style={workspaceStyle}>
        <aside
          ref={sidebarRef}
          className={`sidebar ${isSidebarOpen ? "" : "is-collapsed"}`}
          aria-label="历史记录"
        >
          <div className="sidebar-header">
            <h2>{isSidebarOpen ? "历史" : "库"}</h2>
            <button
              className="icon-only"
              onClick={() => setIsSidebarOpen((current) => !current)}
              title={isSidebarOpen ? "收起历史侧栏" : "展开历史侧栏"}
              data-testid="sidebar-toggle-button"
            >
              {isSidebarOpen ? (
                <PanelRightClose size={16} />
              ) : (
                <PanelRightOpen size={16} />
              )}
            </button>
          </div>

          {isSidebarOpen ? (
            <>
              <label className="search-field">
                <Search size={16} />
                <input
                  data-testid="search-input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索文档"
                />
                <button
                  className="icon-only"
                  onClick={() =>
                    refreshRecords().catch(() => setStatus("刷新失败"))
                  }
                  title="刷新历史"
                >
                  <RefreshCw size={15} />
                </button>
              </label>

              <div className="history-list">
                {filteredRecords.map((record) => (
                  <button
                    key={record.id}
                    className={`history-row ${
                      activeRecord.id === record.id ? "is-active" : ""
                    }`}
                    onClick={() => loadRecord(record)}
                  >
                    <FileText size={18} />
                    <span>
                      <strong>{record.title}</strong>
                      <small>
                        {formatRelativeTime(record.updatedAt)} ·{" "}
                        {formatBytes(record.sizeBytes)}
                      </small>
                    </span>
                    <Trash2
                      size={16}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeRecord(record).catch(() => setStatus("删除失败"));
                      }}
                    />
                  </button>
                ))}

                {filteredRecords.length === 0 ? (
                  <div className="empty-state">暂无历史文档</div>
                ) : null}
              </div>

              <div className="storage-panel">
                <div className="storage-title">
                  <span>存储</span>
                  <button onClick={() => runCleanup("manual")}>清理</button>
                </div>
                <div className="meter" aria-label="存储占用">
                  <span
                    style={{
                      width: `${Math.min(
                        100,
                        (storageBytes / retentionPolicy.maxBytes) * 100,
                      )}%`,
                    }}
                  />
                </div>
                <div className="storage-meta">
                  <span>
                    {formatBytes(storageBytes)} /{" "}
                    {formatBytes(retentionPolicy.maxBytes)}
                  </span>
                  <span>{records.length} 篇</span>
                </div>
                <label className="retention-select">
                  <span>策略</span>
                  <select
                    aria-label="清理策略"
                    data-testid="retention-select"
                    value={settings.retention}
                    onChange={(event) =>
                      applySettings({
                        retention: event.target.value as RetentionChoice,
                      })
                    }
                  >
                    {retentionOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button className="danger-button" onClick={removeAllRecords}>
                  <Trash2 size={15} />
                  清空历史
                </button>
              </div>
            </>
          ) : (
            <div className="sidebar-rail">
              <button
                className="icon-only"
                onClick={() => setIsSidebarOpen(true)}
                title="展开历史"
              >
                <Menu size={17} />
              </button>
              <span>{records.length}</span>
            </div>
          )}
        </aside>

        <section className="editor-pane" aria-label="Markdown 输入">
          <div className="segmented">
            <button
              className={sourceMode === "upload" ? "is-selected" : ""}
              onClick={() => setSourceMode("upload")}
            >
              <Upload size={16} />
              上传
            </button>
            <button
              className={sourceMode === "paste" ? "is-selected" : ""}
              onClick={() => setSourceMode("paste")}
            >
              <Clipboard size={16} />
              粘贴
            </button>
          </div>

          <div className="document-bar">
            <input
              data-testid="title-input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              aria-label="文档标题"
            />
            <button
              className="save-button"
              data-testid="save-button"
              onClick={() => persistCurrent(sourceMode)}
              disabled={!markdown.trim()}
            >
              <Save size={16} />
              保存
            </button>
          </div>

          {sourceMode === "upload" ? (
            <div
              className={`drop-zone ${isDragging ? "is-dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <Upload size={20} />
              <span>拖入 .md / .txt 文件</span>
              <button onClick={() => fileInputRef.current?.click()}>
                选择文件
              </button>
              <input
                ref={fileInputRef}
                data-testid="file-input"
                type="file"
                accept=".md,.markdown,.txt,text/markdown,text/plain"
                onChange={handleFileInput}
              />
            </div>
          ) : null}

          <textarea
            className="source-textarea"
            data-testid="source-textarea"
            value={markdown}
            onChange={(event) => updateMarkdown(event.target.value)}
            spellCheck={false}
            aria-label="Markdown 源文本"
          />

          <footer className="editor-status">
            <span>
              {formatBytes(stats.bytes)} · {stats.words} 词元 · {stats.chars} 字符
            </span>
            <span className={stats.longDocument ? "long-doc" : ""}>
              {stats.longDocument ? "长文档模式" : "实时预览"}
            </span>
          </footer>
        </section>

        <div
          className="pane-resizer"
          role="separator"
          aria-label="调整原始文本和预览宽度"
          aria-orientation="vertical"
          aria-valuemin={28}
          aria-valuemax={72}
          aria-valuenow={editorSplit}
          data-testid="pane-resizer"
          tabIndex={0}
          onPointerDown={startPaneResize}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") updateEditorSplit(editorSplit - 4);
            if (event.key === "ArrowRight") updateEditorSplit(editorSplit + 4);
          }}
        />

        <section className="preview-pane" aria-label="阅读预览">
          <div className="preview-header">
            <div>
              <span>预览</span>
              {isPending ? <Loader2 className="spin" size={15} /> : <Check size={15} />}
            </div>
            <div className="preview-tools" aria-label="预览缩放和阅读面板">
              <ZoomControls
                onChange={updatePreviewZoom}
                value={previewZoom}
                variant="preview"
              />
              <button
                className="reader-open-button"
                onClick={() => setIsReaderOpen(true)}
                title="打开独立阅读面板"
                data-testid="open-reader-button"
              >
                <Maximize2 size={15} />
                <span>阅读</span>
              </button>
            </div>
            <small>{title}</small>
          </div>

          <div
            className="preview-scroll"
            data-testid="preview-scroll"
            ref={previewScrollRef}
            style={{ "--preview-zoom": previewZoom / 100 } as CSSProperties}
          >
            <Suspense
              fallback={<div className="preview-loading">预览加载中</div>}
            >
              <MarkdownPreview
                markdown={deferredMarkdown}
                readerWidth={settings.width}
              />
            </Suspense>
          </div>
        </section>
      </main>

      {isReaderOpen ? (
        <div
          className="reader-panel-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="独立阅读面板"
          data-testid="reader-panel"
        >
          <section className="reader-panel">
            <header className="reader-panel-header">
              <div>
                <span>阅读</span>
                <strong>{title}</strong>
              </div>
              <div className="reader-panel-actions">
                <ZoomControls
                  onChange={updatePreviewZoom}
                  value={previewZoom}
                  variant="panel"
                />
                <button
                  className="icon-button"
                  onClick={exportPdf}
                  title="导出渲染 PDF"
                  data-testid="panel-export-pdf-button"
                  disabled={isExportBusy}
                >
                  {activeExport === "pdf" ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <Download size={16} />
                  )}
                  <span>PDF</span>
                </button>
                <button
                  className="icon-button"
                  onClick={exportWord}
                  title="导出可编辑 Word"
                  data-testid="panel-export-word-button"
                  disabled={isExportBusy}
                >
                  {activeExport === "word" ? (
                    <Loader2 className="spin" size={16} />
                  ) : (
                    <FileText size={16} />
                  )}
                  <span>Word</span>
                </button>
                <button
                  className="icon-button"
                  onClick={() => window.print()}
                  title="打印或另存 PDF"
                  disabled={isExportBusy}
                >
                  <Printer size={16} />
                  <span>打印</span>
                </button>
                <button
                  className="icon-only close-button"
                  onClick={() => setIsReaderOpen(false)}
                  title="关闭阅读面板"
                  data-testid="close-reader-button"
                >
                  <X size={17} />
                </button>
              </div>
            </header>

            <div
              className="reader-panel-body"
              data-testid="reader-panel-body"
              ref={readerPanelBodyRef}
              style={{ "--preview-zoom": previewZoom / 100 } as CSSProperties}
            >
              <Suspense
                fallback={<div className="preview-loading">阅读面板加载中</div>}
              >
                <MarkdownPreview
                  markdown={deferredMarkdown}
                  readerWidth={settings.width}
                />
              </Suspense>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

export default App;
