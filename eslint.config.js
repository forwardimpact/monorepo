import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        console: "readonly",
        process: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        document: "readonly",
        window: "readonly",
        fetch: "readonly",
        customElements: "readonly",
        HTMLElement: "readonly",
        history: "readonly",
        location: "readonly",
        localStorage: "readonly",
        setTimeout: "readonly",
        Blob: "readonly",
        ClipboardItem: "readonly",
        confirm: "readonly",
        navigator: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/**"],
  },
];
