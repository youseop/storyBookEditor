import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "path";

export default defineConfig({
  plugins: [react(), viteSingleFile()],
  root: path.resolve(__dirname, "src/ui"),
  build: {
    target: "es2015",
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: false,
  },
});
