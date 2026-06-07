import { downloadBlob, downloadTextFile } from "./utils";

const EXPORT_SURFACE_WIDTH = 794;
const PDF_MAX_CONTENT_HEIGHT = 1080;
const PDF_CANVAS_SCALE = 1.35;
const PDF_IMAGE_SETTLE_TIMEOUT = 2500;
const WORD_BODY_FONT = "Microsoft YaHei";
const WORD_CODE_FONT = "Courier New";

interface RenderedExportContext {
  fileName: string;
  font: string;
  previewZoom: number;
  theme: string;
  title: string;
}

type BlockquoteDocBlock = { text: string; type: "blockquote" };
type CodeDocBlock = { text: string; type: "code" };
type HeadingDocBlock = { level: number; text: string; type: "heading" };
type ListDocBlock = { ordered: boolean; items: string[]; type: "list" };
type ParagraphDocBlock = { text: string; type: "paragraph" };
type TableDocBlock = { rows: string[][]; type: "table" };

type DocBlock =
  | BlockquoteDocBlock
  | CodeDocBlock
  | HeadingDocBlock
  | ListDocBlock
  | ParagraphDocBlock
  | TableDocBlock;

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function collectDocumentCss() {
  return Array.from(document.styleSheets)
    .map((styleSheet) => {
      try {
        return Array.from(styleSheet.cssRules)
          .map((rule) => rule.cssText)
          .join("\n");
      } catch {
        return "";
      }
    })
    .filter(Boolean)
    .join("\n");
}

function getThemeTokens() {
  const rootStyle = getComputedStyle(document.documentElement);
  return [
    "--ui-font",
    "--reader-font",
    "--mono-font",
    "--app-bg",
    "--panel",
    "--paper",
    "--panel-soft",
    "--ink",
    "--heading",
    "--code-bg",
    "--code-ink",
    "--muted",
    "--border",
    "--border-strong",
    "--accent",
    "--accent-strong",
    "--accent-soft",
    "--accent-ink",
  ]
    .map((name) => {
      const value = rootStyle.getPropertyValue(name).trim();
      return value ? `${name}: ${value};` : "";
    })
    .filter(Boolean)
    .join("\n      ");
}

function articleClassName(article: HTMLElement) {
  return Array.from(article.classList).join(" ");
}

function createRenderedExportHtml(
  article: HTMLElement,
  context: RenderedExportContext,
) {
  const bodyStyle = getComputedStyle(document.body);
  const fileTitle = escapeHtml(context.title);
  const documentCss = collectDocumentCss();

  return `<!doctype html>
<html lang="zh-CN" data-theme="${context.theme}" data-font="${context.font}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${fileTitle}</title>
  <style>
    ${documentCss}
    :root {
      ${getThemeTokens()}
      font-family: ${bodyStyle.fontFamily};
    }
    @page {
      margin: 18mm 16mm;
    }
    html,
    body {
      margin: 0;
      min-width: 0;
      min-height: 100%;
      background: var(--app-bg);
      color: var(--ink);
      font-family: ${bodyStyle.fontFamily};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .export-document {
      width: 100%;
      max-width: 980px;
      margin: 0 auto;
      padding: 48px 32px;
      background: var(--app-bg);
    }
    .export-document .markdown-body {
      color: var(--ink);
    }
    .export-document .markdown-body > * {
      content-visibility: visible !important;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <main class="export-document">
    <article class="${escapeHtml(articleClassName(article))}" style="--preview-zoom: ${
      context.previewZoom / 100
    }">
      ${article.innerHTML}
    </article>
  </main>
</body>
</html>`;
}

export function downloadRenderedHtml(
  article: HTMLElement,
  context: RenderedExportContext,
) {
  downloadTextFile(
    context.fileName,
    createRenderedExportHtml(article, context),
    "text/html;charset=utf-8",
  );
}

function createArticleShell(article: HTMLElement, previewZoom: number) {
  const shell = document.createElement("article");
  shell.className = articleClassName(article);
  shell.style.setProperty("--preview-zoom", `${previewZoom / 100}`);
  return shell;
}

function createExportSurface(className: string, article: HTMLElement) {
  const surface = document.createElement("main");
  surface.className = className;
  surface.setAttribute("aria-hidden", "true");
  surface.append(article);
  return surface;
}

function getOuterHeight(element: Element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return (
    rect.height +
    Number.parseFloat(style.marginTop || "0") +
    Number.parseFloat(style.marginBottom || "0")
  );
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function waitForImage(image: HTMLImageElement) {
  if (image.complete) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, PDF_IMAGE_SETTLE_TIMEOUT);

    function finish() {
      window.clearTimeout(timeout);
      image.removeEventListener("load", finish);
      image.removeEventListener("error", finish);
      resolve();
    }

    image.addEventListener("load", finish, { once: true });
    image.addEventListener("error", finish, { once: true });
  });
}

function replaceBrokenImage(image: HTMLImageElement) {
  if (image.naturalWidth > 0 && image.naturalHeight > 0) return;

  const fallback = document.createElement("div");
  fallback.className = "export-image-fallback";
  fallback.textContent = image.alt
    ? `图片无法加载：${image.alt}`
    : "图片无法加载";
  image.replaceWith(fallback);
}

async function settleImages(surface: HTMLElement) {
  const images = Array.from(surface.querySelectorAll("img"));
  await Promise.all(images.map(waitForImage));
  images.forEach(replaceBrokenImage);
}

function chunkArticleChildren(article: HTMLElement, maxHeight: number) {
  const children = Array.from(article.children);
  const groups: Element[][] = [];
  let current: Element[] = [];
  let currentHeight = 0;

  for (const child of children) {
    const childHeight = Math.max(1, getOuterHeight(child));
    if (current.length > 0 && currentHeight + childHeight > maxHeight) {
      groups.push(current);
      current = [];
      currentHeight = 0;
    }

    current.push(child);
    currentHeight += childHeight;
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups.length ? groups : [children];
}

export async function downloadRenderedPdf(
  article: HTMLElement,
  context: RenderedExportContext,
) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);
  await document.fonts?.ready;

  const previewZoom = context.previewZoom;
  const measureArticle = article.cloneNode(true) as HTMLElement;
  measureArticle.style.setProperty("--preview-zoom", `${previewZoom / 100}`);
  const measureSurface = createExportSurface(
    "export-surface export-measure-surface",
    measureArticle,
  );
  document.body.append(measureSurface);
  await nextFrame();

  const groups = chunkArticleChildren(measureArticle, PDF_MAX_CONTENT_HEIGHT);
  const pdf = new jsPDF({ format: "a4", orientation: "portrait", unit: "mm" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const backgroundColor =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--app-bg")
      .trim() || "#ffffff";

  try {
    for (let index = 0; index < groups.length; index += 1) {
      const pageArticle = createArticleShell(article, previewZoom);
      for (const child of groups[index]) {
        pageArticle.append(child.cloneNode(true));
      }

      const pageSurface = createExportSurface(
        "export-surface export-page-surface",
        pageArticle,
      );
      document.body.append(pageSurface);
      await nextFrame();
      await settleImages(pageSurface);

      const canvas = await html2canvas(pageSurface, {
        backgroundColor,
        imageTimeout: PDF_IMAGE_SETTLE_TIMEOUT,
        logging: false,
        scale: PDF_CANVAS_SCALE,
        useCORS: true,
        windowWidth: EXPORT_SURFACE_WIDTH,
      });

      pageSurface.remove();
      if (index > 0) pdf.addPage();
      pdf.addImage(
        canvas.toDataURL("image/jpeg", 0.98),
        "JPEG",
        0,
        0,
        pageWidth,
        pageHeight,
      );
    }

    pdf.save(context.fileName);
  } finally {
    measureSurface.remove();
    document
      .querySelectorAll(".html2canvas-container, .export-page-surface")
      .forEach((node) => node.remove());
  }
}

function textFromElement(element: Element) {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".katex").forEach((mathNode) => {
    const annotation = mathNode.querySelector(
      'annotation[encoding="application/x-tex"]',
    );
    const text = annotation?.textContent?.trim() || mathNode.textContent || "";
    mathNode.replaceWith(document.createTextNode(text ? `$${text}$` : ""));
  });
  return (clone.textContent ?? "").replace(/\n{3,}/g, "\n\n").trim();
}

function extractDocBlocks(article: HTMLElement): DocBlock[] {
  return Array.from(article.children)
    .flatMap((child): DocBlock[] => {
      const tagName = child.tagName.toLowerCase();

      if (/h[1-6]/.test(tagName)) {
        return [
          {
            level: Number(tagName.slice(1)),
            text: textFromElement(child),
            type: "heading",
          },
        ];
      }

      if (tagName === "p") {
        return [{ text: textFromElement(child), type: "paragraph" }];
      }

      if (tagName === "blockquote") {
        return [{ text: textFromElement(child), type: "blockquote" }];
      }

      if (tagName === "pre") {
        return [{ text: child.textContent ?? "", type: "code" }];
      }

      if (tagName === "ul" || tagName === "ol") {
        return [
          {
            items: Array.from(child.querySelectorAll(":scope > li"))
              .map((item) => textFromElement(item))
              .filter(Boolean),
            ordered: tagName === "ol",
            type: "list",
          },
        ];
      }

      const table = child.matches("table")
        ? child
        : child.querySelector("table");
      if (table) {
        return [
          {
            rows: Array.from(table.querySelectorAll("tr")).map((row) =>
              Array.from(row.querySelectorAll("th,td")).map((cell) =>
                textFromElement(cell),
              ),
            ),
            type: "table",
          },
        ];
      }

      const text = textFromElement(child);
      return text ? [{ text, type: "paragraph" }] : [];
    })
    .filter((block) => {
      if ("text" in block) return block.text.length > 0;
      if (block.type === "list") return block.items.length > 0;
      return block.rows.length > 0;
    });
}

export async function downloadRenderedWord(
  article: HTMLElement,
  context: RenderedExportContext,
) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import("docx");

  function headingLevelFor(level: number) {
    switch (level) {
      case 1:
        return HeadingLevel.HEADING_1;
      case 2:
        return HeadingLevel.HEADING_2;
      case 3:
        return HeadingLevel.HEADING_3;
      case 4:
        return HeadingLevel.HEADING_4;
      case 5:
        return HeadingLevel.HEADING_5;
      case 6:
        return HeadingLevel.HEADING_6;
      default:
        return HeadingLevel.HEADING_3;
    }
  }

  function createTextRun(
    text: string,
    options?: { bold?: boolean; code?: boolean; italics?: boolean },
  ) {
    return new TextRun({
      bold: options?.bold,
      font: options?.code ? WORD_CODE_FONT : WORD_BODY_FONT,
      italics: options?.italics,
      size: options?.code ? 20 : 22,
      text,
    });
  }

  function paragraphFromText(text: string, options?: { code?: boolean }) {
    return new Paragraph({
      children: text.split("\n").flatMap((line, index) => [
        ...(index > 0 ? [new TextRun({ break: 1 })] : []),
        createTextRun(line, options),
      ]),
      spacing: { after: 180, line: 330 },
    });
  }

  function headingFromBlock(block: Extract<DocBlock, { type: "heading" }>) {
    return new Paragraph({
      children: [createTextRun(block.text, { bold: true })],
      heading: headingLevelFor(block.level),
      spacing: { after: 180, before: block.level === 1 ? 0 : 280 },
    });
  }

  function blockquoteFromBlock(
    block: Extract<DocBlock, { type: "blockquote" }>,
  ) {
    return new Paragraph({
      border: {
        left: {
          color: "7fbca9",
          size: 14,
          space: 8,
          style: BorderStyle.SINGLE,
        },
      },
      children: [createTextRun(block.text, { italics: true })],
      spacing: { after: 180, line: 330 },
    });
  }

  function listFromBlock(block: Extract<DocBlock, { type: "list" }>) {
    return block.items.map((item, index) => {
      const marker = block.ordered ? `${index + 1}.` : "-";

      return new Paragraph({
        children: [createTextRun(`${marker} ${item}`)],
        spacing: { after: 120, line: 330 },
      });
    });
  }

  function tableFromBlock(block: Extract<DocBlock, { type: "table" }>) {
    return new Table({
      rows: block.rows.map(
        (row) =>
          new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  children: [paragraphFromText(cell || " ")],
                  margins: {
                    bottom: 120,
                    left: 140,
                    right: 140,
                    top: 120,
                  },
                }),
            ),
          }),
      ),
      width: { size: 100, type: WidthType.PERCENTAGE },
    });
  }

  function childrenFromBlock(block: DocBlock) {
    switch (block.type) {
      case "heading":
        return [headingFromBlock(block)];
      case "code":
        return [paragraphFromText(block.text.trimEnd(), { code: true })];
      case "blockquote":
        return [blockquoteFromBlock(block)];
      case "list":
        return listFromBlock(block);
      case "table":
        return [tableFromBlock(block)];
      case "paragraph":
        return [paragraphFromText(block.text)];
    }
  }

  const children = extractDocBlocks(article).flatMap(childrenFromBlock);

  const doc = new Document({
    sections: [
      {
        children: children.length
          ? children
          : [paragraphFromText(article.innerText || context.title)],
        properties: {},
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: WORD_BODY_FONT,
            size: 22,
          },
        },
      },
      paragraphStyles: [
        {
          id: "Title",
          name: "Title",
          basedOn: "Normal",
          next: "Normal",
          quickFormat: true,
          run: { bold: true, size: 40 },
          paragraph: {
            alignment: AlignmentType.LEFT,
            spacing: { after: 280 },
          },
        },
      ],
    },
  });

  const blob = await Packer.toBlob(doc);
  downloadBlob(
    context.fileName,
    new Blob([blob], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
}
