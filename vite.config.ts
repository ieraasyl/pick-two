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
    ignorePatterns: ["apps/product/worker-configuration.d.ts", "apps/product/src/routeTree.gen.ts"],
    sortTailwindcss: {
      stylesheet: "./apps/product/src/index.css",
      functions: ["cn", "clsx"],
    },
  },
  lint: {
    ignorePatterns: ["apps/product/worker-configuration.d.ts", "apps/product/src/routeTree.gen.ts"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "@tanstack/query/exhaustive-deps": "error",
      "@tanstack/query/infinite-query-property-order": "error",
      "@tanstack/query/mutation-property-order": "error",
      "@tanstack/query/no-rest-destructuring": "warn",
      "@tanstack/query/no-unstable-deps": "error",
      "@tanstack/query/no-void-query-fn": "off",
      "@tanstack/query/stable-query-client": "error",
      "@tanstack/router/create-route-property-order": "error",
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    overrides: [
      {
        files: ["apps/product/src/routes/**/*.tsx"],
        rules: {
          "react/only-export-components": "off",
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
      {
        name: "@tanstack/query",
        specifier: "@tanstack/eslint-plugin-query",
      },
      {
        name: "@tanstack/router",
        specifier: "@tanstack/eslint-plugin-router",
      },
    ],
  },
});
