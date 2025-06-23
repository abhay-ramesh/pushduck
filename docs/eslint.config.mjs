import { FlatCompat } from "@eslint/eslintrc";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
    baseDirectory: __dirname,
});

const eslintConfig = [
    ...compat.extends("next/core-web-vitals"),
    {
        ignores: [
            "**/.next/**",
            "**/node_modules/**",
            "**/dist/**",
            "**/.turbo/**",
        ],
    },
    {
        rules: {
            // Disable some rules that might be too strict for docs
            "@next/next/no-html-link-for-pages": "off",
            "react/no-unescaped-entities": "off",
        },
    },
];

export default eslintConfig; 