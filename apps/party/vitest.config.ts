import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "party",
    include: ["test/**/*.test.ts"],
  },
});
