import type { RetentionChoice } from "./types";

const textEncoder = new TextEncoder();

export const retentionPolicies = {
  compact: {
    label: "轻量",
    maxRecords: 24,
    maxBytes: 12 * 1024 * 1024,
    maxAgeDays: 14,
  },
  balanced: {
    label: "均衡",
    maxRecords: 50,
    maxBytes: 30 * 1024 * 1024,
    maxAgeDays: 45,
  },
  archive: {
    label: "归档",
    maxRecords: 120,
    maxBytes: 96 * 1024 * 1024,
    maxAgeDays: 180,
  },
} satisfies Record<
  RetentionChoice,
  {
    label: string;
    maxRecords: number;
    maxBytes: number;
    maxAgeDays: number;
  }
>;

export function estimateBytes(value: string): number {
  return textEncoder.encode(value).byteLength;
}

export function countReadableTokens(value: string): number {
  const matches = value.match(/[\u4e00-\u9fff]|[A-Za-z0-9_]+/g);
  return matches?.length ?? 0;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return "刚刚";
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;

  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
  }).format(timestamp);
}

export function makeDocumentTitle(fileName: string | undefined, content: string) {
  const firstHeading = content
    .split("\n")
    .map((line) => line.trim())
    .find((line) => /^#{1,3}\s+\S/.test(line));

  if (firstHeading) {
    return firstHeading.replace(/^#{1,3}\s+/, "").slice(0, 80);
  }

  if (fileName) {
    return fileName.replace(/\.(md|markdown|txt)$/i, "").slice(0, 80);
  }

  const firstText = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  return firstText ? firstText.slice(0, 80) : "未命名文档";
}

export function downloadTextFile(
  fileName: string,
  content: string,
  mimeType: string,
) {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(fileName, blob);
}

export function downloadBlob(fileName: string, blob: Blob) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  link.rel = "noreferrer";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(href), 0);
}

export function createRecordId() {
  if ("randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
