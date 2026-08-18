import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
          daily: ["@daily-co/daily-js"],
        },
      },
    },
    // Améliore le tree-shaking et la taille des chunks
    chunkSizeWarningLimit: 600,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
