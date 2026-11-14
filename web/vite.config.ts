import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  // Luna's AI answers go to the small proxy in ../server (keeps the Gemini key off the website).
  server: { proxy: { "/api/assistant": "http://127.0.0.1:8787" } },
  test: {
    environment: "jsdom",
    globals: true,
    coverage: { include: ["src/lib/**", "src/api/**"], reporter: ["text"] },
  },
});
