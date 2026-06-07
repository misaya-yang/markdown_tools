import type { MarkdownRecord } from "./types";
import { countReadableTokens, estimateBytes } from "./utils";

export const sampleMarkdown = `# MarkLens 阅读样稿

MarkLens 会把 Markdown 渲染成适合人类阅读的版式：标题有层级，正文有舒适行宽，表格、代码和公式都保持清晰。

## LaTeX 公式

行内公式：$E = mc^2$，以及 $\\int_a^b f(x)\\,dx$。

块级公式：

$$
\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}
$$

## 代码块

\`\`\`ts
type MarkdownRecord = {
  title: string;
  content: string;
  updatedAt: number;
};

const words = content.match(/[\\u4e00-\\u9fff]|[A-Za-z0-9_]+/g)?.length ?? 0;
\`\`\`

## 表格

| 能力 | 状态 | 备注 |
| --- | --- | --- |
| 上传 .md | 完成 | 自动进入历史 |
| 粘贴文本 | 完成 | 实时渲染 |
| LaTeX | 完成 | 支持行内与块级 |
| 长文档 | 完成 | 独立滚动与延迟渲染 |

> 排版的目标不是炫技，而是让读者能持续读下去。

## 长文档段落

当文档变长时，MarkLens 会保持编辑区和阅读区分离滚动，并把渲染更新放到较低优先级，减少输入时的阻塞感。历史记录只保存在本机浏览器里，达到数量、体积或保留天数上限后会自动清理旧文档。
`;

export const sampleRecord: MarkdownRecord = {
  id: "sample",
  title: "MarkLens 阅读样稿",
  content: sampleMarkdown,
  origin: "sample",
  createdAt: Date.now(),
  updatedAt: Date.now(),
  sizeBytes: estimateBytes(sampleMarkdown),
  wordCount: countReadableTokens(sampleMarkdown),
};
