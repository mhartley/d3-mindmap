import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { files: ["**/*.{js,mjs,cjs,ts}"], ignores: ["node_modules/"] },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { languageOptions: { globals: globals.browser } },
  {
    rules: {
      "no-explicit-any": "off",
    },
  },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
];
