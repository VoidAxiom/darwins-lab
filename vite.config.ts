import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Workers are bundled via the native `new Worker(new URL(...), import.meta.url)`
// syntax, so no extra worker plugin config is required.
export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es",
  },
});
