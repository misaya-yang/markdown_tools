export type ThemeChoice = "day" | "night" | "sage";

export type FontChoice = "system" | "serif" | "song" | "mono";

export type WidthChoice = "narrow" | "comfort" | "wide" | "full";

export type SourceMode = "upload" | "paste";

export type RetentionChoice = "balanced" | "compact" | "archive";

export type HistoryOrigin = "upload" | "paste" | "sample";

export interface MarkdownRecord {
  id: string;
  title: string;
  content: string;
  origin: HistoryOrigin;
  fileName?: string;
  createdAt: number;
  updatedAt: number;
  sizeBytes: number;
  wordCount: number;
}

export interface ReaderSettings {
  theme: ThemeChoice;
  font: FontChoice;
  width: WidthChoice;
  retention: RetentionChoice;
  previewZoom: number;
}

export interface CleanupResult {
  deleted: number;
  freedBytes: number;
}
