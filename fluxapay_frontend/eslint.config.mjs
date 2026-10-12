import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "docs/**",
    "public/**",
  ]),
  {
    rules: {
      // Pre-existing patterns across the app; enforced setState-in-effect breaks guards/hooks.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",

      // Prevent shadowing of outer scope names (enums, functions, variables)
      "@typescript-eslint/no-shadow": "error",

      // Enforce consistent import/export of types
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    // Narrow no-explicit-any override to only the one test file that genuinely needs it
    files: [
      "src/features/dashboard/components/__tests__/Sidebar.test.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    ignores: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "**/__tests__/**",
      "src/__tests__/**",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [{
            group: ["*mock*"],
            message:
              "Mock files should only be imported in test files, not in production code. " +
              "Move the mock file import to a .test.ts/.test.tsx file or __tests__ directory.",
          }],
        },
      ],
    },
  },
]);

export default eslintConfig;
