import js from "@eslint/js";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig,
  {
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
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
        requestAnimationFrame: "readonly",
        IntersectionObserver: "readonly",
      },
    },
  },
  {
    files: ["products/basecamp/**/*.js", "products/basecamp/**/*.mjs"],
    languageOptions: {
      globals: {
        Buffer: "readonly",
        Deno: "readonly",
        Response: "readonly",
        setInterval: "readonly",
        require: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
      },
    },
    rules: {
      "no-empty": "off",
    },
  },
  {
    files: ["libraries/**/*.js", "services/**/*.js"],
    languageOptions: {
      globals: {
        global: "readonly",
        Buffer: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        TextEncoder: "readonly",
        TextDecoder: "readonly",
        structuredClone: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        btoa: "readonly",
        atob: "readonly",
        EventTarget: "readonly",
        Event: "readonly",
        crypto: "readonly",
        performance: "readonly",
        Response: "readonly",
        Headers: "readonly",
        ReadableStream: "readonly",
        queueMicrotask: "readonly",
      },
    },
  },
  {
    ignores: ["node_modules/**", "tmp/**", "**/dist/**", "**/generated/**"],
  },
];
