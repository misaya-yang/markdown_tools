import ReactMarkdown, { type Components } from "react-markdown";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdownLanguage from "highlight.js/lib/languages/markdown";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, {
  defaultSchema,
  type Options as SanitizeSchema,
} from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

const fullwidthLinkBoundaryPattern = /[、。，；：！？（）【】《》「」『』]/u;

const highlightLanguages = {
  bash,
  sh: bash,
  css,
  go,
  java,
  javascript,
  js: javascript,
  json,
  markdown: markdownLanguage,
  md: markdownLanguage,
  python,
  py: python,
  rust,
  rs: rust,
  sql,
  typescript,
  ts: typescript,
  xml,
  html: xml,
  yaml,
  yml: yaml,
};

function textFromChildren(children: unknown): string | null {
  if (typeof children === "string") return children;
  if (!Array.isArray(children)) return null;

  return children.every((child) => typeof child === "string")
    ? children.join("")
    : null;
}

function isAutolinkEcho(href: string | undefined, text: string) {
  if (!href || !/^(https?:\/\/|www\.)/i.test(text)) return false;
  const normalized = text.startsWith("www.") ? `http://${text}` : text;
  return href === encodeURI(normalized);
}

function splitFullwidthAutolink(href: string | undefined, text: string) {
  if (!isAutolinkEcho(href, text)) return null;

  const splitIndex = text.search(fullwidthLinkBoundaryPattern);
  if (splitIndex <= 0) return null;

  const rawLinkText = text.slice(0, splitIndex);
  const trailingPunctuation = rawLinkText.match(/[.,;:!?]+$/u)?.[0] ?? "";
  const linkText = trailingPunctuation
    ? rawLinkText.slice(0, -trailingPunctuation.length)
    : rawLinkText;
  const suffix = `${trailingPunctuation}${text.slice(splitIndex)}`;
  const nextHref = linkText.startsWith("www.") ? `http://${linkText}` : linkText;
  return { href: nextHref, linkText, suffix };
}

const components: Components = {
  a({ children, node, ...props }) {
    void node;
    const text = textFromChildren(children);
    const autolink = text
      ? splitFullwidthAutolink(props.href, text)
      : null;

    if (autolink) {
      return (
        <>
          <a {...props} href={autolink.href} target="_blank" rel="noreferrer">
            {autolink.linkText}
          </a>
          {autolink.suffix}
        </>
      );
    }

    return (
      <a {...props} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  },
  table({ node, ...props }) {
    void node;
    return (
      <div className="table-wrap">
        <table {...props} />
      </div>
    );
  },
};

const sanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "mark"],
};

interface MarkdownPreviewProps {
  markdown: string;
  readerWidth: string;
}

export function MarkdownPreview({
  markdown,
  readerWidth,
}: MarkdownPreviewProps) {
  return (
    <article className={`markdown-body reader-${readerWidth}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[
          rehypeRaw,
          [rehypeSanitize, sanitizeSchema],
          rehypeKatex,
          [rehypeHighlight, { detect: false, languages: highlightLanguages }],
        ]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
