import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config} */
export default [
  { ignores: ["storybook-static/**"] },
  ...config,
  {
    files: ["src/components/**/*.tsx"],
    rules: {
      "react/function-component-definition": "off",
    },
  },
];
