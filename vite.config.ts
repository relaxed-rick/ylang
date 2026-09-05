import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { defineConfig } from "vite";

const WRAPPED_CONTENT_SCRIPTS = ["content", "reading", "deepl", "netflixPageHook"];

export default defineConfig({
  plugins: [wrapContentScripts()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: resolve(__dirname, "src/extension/background/main.ts"),
        content: resolve(__dirname, "src/extension/content/main.ts"),
        netflixPageHook: resolve(__dirname, "src/extension/content/netflixPageHook.ts"),
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

function wrapContentScripts() {
  return {
    name: "wrap-content-scripts",
    closeBundle() {
      for (const name of WRAPPED_CONTENT_SCRIPTS) {
        const path = resolve(__dirname, "dist", "assets", `${name}.js`);
        const code = readFileSync(path, "utf8");
        if (code.startsWith("(() => {")) {
          continue;
        }

        writeFileSync(path, [
          "(() => {",
          `const marker = "__ylang_${name}_script_loaded__";`,
          "if (globalThis[marker]) return;",
          "globalThis[marker] = true;",
          code,
          "})();",
          ""
        ].join("\n"));
      }
    }
  };
}
