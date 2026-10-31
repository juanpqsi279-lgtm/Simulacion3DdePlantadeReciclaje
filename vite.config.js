import { defineConfig } from "vite";

// Empaquetador Vite puro para Vanilla JS (Módulos ES6), sin frameworks inyectados.
export default defineConfig({
  base: "./",
  assetsInclude: ["**/*.hdr", "**/*.wasm"],
  optimizeDeps: {
    exclude: ["@babylonjs/havok"],
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 3500,
  },
});
