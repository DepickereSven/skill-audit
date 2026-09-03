import eslint from "@eslint/js";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
    {
        ignores: ["dist/**", "node_modules/**", "bun.lock"],
    },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ["src/**/*.ts", "test/**/*.ts"],
        languageOptions: {
            parserOptions: {
                project: "./tsconfig.test.json",
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        rules: {
            "object-curly-newline": [
                "error",
                {
                    ObjectExpression: {
                        minProperties: 2,
                        multiline: true,
                    },
                    ObjectPattern: "never",
                },
            ],
            semi: ["error", "always"],
            "simple-import-sort/exports": "error",
            "simple-import-sort/imports": "error",
        },
    },
);
