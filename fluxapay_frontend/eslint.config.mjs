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
      // Prevent variable shadowing on TypeScript types, enums, and variables
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": [
        "error",
        {
          builtinGlobals: false,
          hoist: "all",
          allow: [],
          ignoreTypeValueShadow: true,
          ignoreFunctionTypeParameterNameValueShadow: true,
        },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
    },
  },
  {
    files: [
      "**/__tests__/**/*.test.ts",
      "**/__tests__/**/*.test.tsx",
      "src/__tests__/**/*.test.ts",
      "src/__tests__/**/*.test.tsx",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
