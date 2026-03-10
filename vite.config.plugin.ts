import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "es2015",
    lib: {
      entry: "src/plugin/code.ts",
      formats: ["iife"],
      name: "code",
      fileName: () => "code.js",
    },
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: "code.js",
        extend: true,
      },
    },
  },
});
