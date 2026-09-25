import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/Sterling-Mutual-Insurance/",
  server: { port: 5173 },
});
