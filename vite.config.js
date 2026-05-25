import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "examples/src"),
  optimizeDeps: {
    exclude: ["opengeometry"],
  },
  resolve: {
    dedupe: ["three", "opengeometry"],
  },
  build: {
    target: "esnext",
    outDir: resolve(__dirname, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        gitcad: resolve(__dirname, "examples/src/gitcad-agent.html"),
      },
    },
  },
  server: {
    port: 5566,
  },
});
