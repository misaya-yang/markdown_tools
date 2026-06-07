# MarkLens

MarkLens is a browser-based Markdown reading and export tool. It supports pasting or uploading Markdown, rendering long documents with clear typography, parsing LaTeX formulas, keeping local history, and exporting rendered content as HTML, PDF, or Word.

Production site: <https://marklens-reader.netlify.app/>

## Features

- Markdown paste and `.md` / `.txt` upload
- GitHub Flavored Markdown: tables, task lists, strikethrough, footnotes, and autolinks
- LaTeX rendering through KaTeX
- Safe raw HTML rendering for common reading tags such as `details`, `summary`, `kbd`, and `mark`
- Local document history with retention cleanup
- Light, dark, and eye-care themes
- Adjustable reading width, font, and zoom
- Collapsible history sidebar and draggable editor / preview split
- Full-screen reading panel
- Rendered export to HTML, PDF, and `.docx`

## Development

```bash
npm install
npm run dev
```

## Validation

```bash
npm run lint
npm run build
```

## Deployment

The app is configured for Netlify with `netlify.toml`.

```bash
npm run build
```

Publish directory: `dist`
