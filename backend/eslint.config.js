import js from "@eslint/js";
import globals from "globals";
import nodePlugin from "eslint-plugin-node";
import prettierPlugin from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettierConfig, // ← desactiva reglas de ESLint que chocan con Prettier

  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      node: nodePlugin,
      prettier: prettierPlugin, // ← agrega Prettier como plugin
    },
    rules: {
      // Prettier corre como regla — los errores de formato aparecen en ESLint
      "prettier/prettier": [
        "error",
        {
          endOfLine: "auto",
        },
      ],
      // ── Las demás reglas se quedan igual ──────────
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      "no-debugger": "error",
      "prefer-const": "error",
      "no-var": "error",
      "no-throw-literal": "error",
      "handle-callback-err": "error",
      "no-return-await": "warn",
      "require-await": "warn",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      eqeqeq: ["error", "always"],
      curly: ["error", "all"],
    },
  },

  {
    ignores: ["node_modules/**", "dist/**", "build/**", "coverage/**"],
  },
];
