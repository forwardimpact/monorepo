import jsdoc from "eslint-plugin-jsdoc";

export default [
  {
    files: [
      "libraries/**/*.js",
      "libraries/**/*.mjs",
      "products/**/*.js",
      "products/**/*.mjs",
      "services/**/*.js",
      "services/**/*.mjs",
      "scripts/**/*.js",
      "scripts/**/*.mjs",
    ],
    plugins: { jsdoc },
    rules: {
      "jsdoc/require-jsdoc": [
        "error",
        {
          publicOnly: true,
          require: {
            FunctionDeclaration: true,
            MethodDefinition: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
        },
      ],
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/generated/**",
      ".claude/worktrees/**",
      "products/gemba/actions/**",
      "products/kata/actions/**",
      "design/**",
      "public/**",
      "tmp/**",
      "scripts/test/byok-fixtures/**",
    ],
  },
];
