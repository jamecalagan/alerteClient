import globals from "globals";
import pluginJs from "@eslint/js";


/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node, __DEV__: "readonly" },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  pluginJs.configs.recommended,
  {
    rules: {
      // Désactivé : sans eslint-plugin-react (non installé), ESLint ne sait pas
      // qu'un import JSX (ex. <View>) compte comme une utilisation de la variable,
      // ce qui générerait des centaines de faux positifs sur ce projet React Native.
      "no-unused-vars": "off",
    },
  },
];