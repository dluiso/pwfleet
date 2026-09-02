import { configDefaults, defineConfig } from "vitest/config";
export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, ".next/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
    },
  },
});
