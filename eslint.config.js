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
      "libraries/libharness/actions/**",
      "libraries/libwiki/actions/**",
      "products/kata/actions/**",
      ".github/actions/bootstrap/**",
      "design/**",
      "public/**",
      "tmp/**",
      "scripts/test/byok-fixtures/**",
    ],
  },
];
