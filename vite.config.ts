import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/katex/")) return "katex";
          if (
            id.includes("/node_modules/highlight.js/") ||
            id.includes("/node_modules/lowlight/") ||
            id.includes("/node_modules/react-markdown/") ||
            id.includes("/node_modules/remark-") ||
            id.includes("/node_modules/rehype-") ||
            id.includes("/node_modules/mdast-") ||
            id.includes("/node_modules/hast-") ||
            id.includes("/node_modules/micromark") ||
            id.includes("/node_modules/unified/")
          ) {
            return "markdown";
          }
        },
      },
    },
  },
});
