import path from "node:path";
import { fileURLToPath } from "node:url";

import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default [
  // Next.js presets (via legacy compat).
  ...compat.extends("next/core-web-vitals", "next/typescript"),

  // Repo-wide ignores for generated artifacts.
  {
    ignores: [".next/**", "dist/**", "node_modules/**", "out/**", "coverage/**"],
  },
];
