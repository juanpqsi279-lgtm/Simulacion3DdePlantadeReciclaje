import { defineConfig } from "vite";

// Vite solo como empaquetador básico: sin plugins de frameworks.
export default defineConfig({
  base: "./",
  build: {
    chunkSizeWarningLimit: 6000,
  },
});
