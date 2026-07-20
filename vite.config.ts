import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/extension/background/main.ts"),
        content: resolve(__dirname, "src/extension/content/main.ts"),
        deepl: resolve(__dirname, "src/extension/deepl/main.ts"),
        reading: resolve(__dirname, "src/extension/reading/main.ts"),
        popup: resolve(__dirname, "src/extension/popup/index.html"),
        options: resolve(__dirname, "src/extension/options/index.html")
      },
      output: {
        entryFileNames: "assets/[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]"
      }
    }
  }
});
