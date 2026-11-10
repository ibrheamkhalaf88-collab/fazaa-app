import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "archive/", "test-results/", ".wrangler/"] },
  js.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2024, sourceType: "module" },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      // Safety rule of the project: text goes in with textContent, never as markup.
      "no-restricted-properties": [
        "error",
        { property: "innerHTML", message: "Use textContent / el() so user text can never become markup." },
        { property: "outerHTML", message: "Use textContent / el()." },
        { property: "insertAdjacentHTML", message: "Use textContent / el()." },
      ],
    },
  },
  // browser code: the app, the staff dashboard, the service worker
  { files: ["src/**", "admin/**"], languageOptions: { globals: globals.browser } },
  { files: ["sw.js"], languageOptions: { globals: globals.serviceworker } },
  // Workers + Node scripts/tests
  {
    files: ["server/**", "scripts/**", "tests/**"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
