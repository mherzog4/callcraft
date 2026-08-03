import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "next-env.d.ts",
    ".next/**",
    "node_modules/**",
    "coverage/**",
    "data/**",
    "playwright-report/**",
    "test-results/**",
    ".opencode/**",
    ".pi-subagents/**",
  ]),
]);
