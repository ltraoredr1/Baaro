import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Keep large/rarely-used libraries out of the initial application chunk.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@daily-co/daily-js")) return "daily";
          if (id.includes("recharts") || id.includes("d3-")) return "charts";
          if (id.includes("@supabase")) return "supabase";
          if (id.includes("react") || id.includes("react-dom") || id.includes("scheduler")) return "vendor";
          return "vendor-external";
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
