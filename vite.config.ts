import { defineConfig } from "vite-plus";

export default defineConfig({
  defaultPackage: "./apps/product",
  test: {
    projects: ["./apps/product/vitest.config.ts"],
  },
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    ignorePatterns: ["apps/product/worker-configuration.d.ts"],
    sortTailwindcss: {
      stylesheet: "./apps/product/src/index.css",
      functions: ["cn", "clsx"],
    },
  },
  lint: {
    ignorePatterns: ["apps/product/worker-configuration.d.ts"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
});
