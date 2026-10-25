import { config } from "@repo/eslint-config/react-internal";

/** @type {import("eslint").Linter.Config} */
export default [
  { ignores: ["storybook-static/**"] },
  ...config,
  {
    files: ["src/**/*.tsx"],
    ignores: ["**/*.test.*", "**/*.stories.*"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "JSXOpeningElement:matches([name.name='Button'], [name.name='button']) > JSXAttribute[name.name='type'][value.value='submit']",
          message: "Use shared SaveButton for form submissions.",
        },
      ],
    },
  },
  {
    files: ["src/components/**/*.tsx"],
    rules: {
      "react/function-component-definition": "off",
    },
  },
];
