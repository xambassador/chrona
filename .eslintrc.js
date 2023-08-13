/** @type {import("eslint").Linter.Config} */
module.exports = {
  env: {
    node: true,
  },
  extends: [
    "plugin:@typescript-eslint/recommended",
    "eslint:recommended",
    "airbnb-typescript/base",
    "plugin:import/errors",
    "plugin:import/warnings",
    "plugin:import/typescript",
    "plugin:prettier/recommended",
  ],
  plugins: ["@typescript-eslint", "import", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  settings: {
    "import/parsers": {
      "@typescript-eslint/parser": [".ts"],
    },
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/default-param-last": "off",
  },
  ignorePatterns: ["**/*.js", "node_modules", "dist", "coverage"],
};
