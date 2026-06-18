// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      ".vercel/**",
      ".team-os/**",
      "agent-office/**",
      "out/**",
      "build/**",
      "webhard-api/dist/**",
      "webhard-api/node_modules/**",
      "e2e/**",
      "next-env.d.ts",
      "scripts/**",
      "jest.config.js",
      "agent-office/**",
      ".team-os/**",
    ],
  },
  ...storybook.configs["flat/recommended"],
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "react/no-unescaped-entities": "off",
      "@next/next/no-page-custom-font": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      // ========================================
      // Design System 규칙 (11-design-system task)
      // ========================================
      "no-restricted-syntax": [
        "warn",
        {
          "selector": "Literal[value=/\\bdark:/]",
          "message": "dark: 클래스는 금지됨. CSS 변수가 다크모드를 자동 처리합니다 (TEXT_COLOR.primary, bg-foreground 등 사용)."
        },
        {
          "selector": "Literal[value=/#[Ee][Dd]6[Cc]00|#d15f00|#[Ff][Ff]8533|#c45500/]",
          "message": "brand hex 색상 하드코딩 금지. 'brand', 'brand-hover' 토큰을 사용하세요 (bg-brand, text-brand)."
        },
        {
          "selector": "TemplateElement[value.raw=/\\bdark:/]",
          "message": "dark: 클래스는 금지됨. CSS 변수가 다크모드를 자동 처리합니다."
        },
        {
          "selector": "TemplateElement[value.raw=/#[Ee][Dd]6[Cc]00|#d15f00|#[Ff][Ff]8533/]",
          "message": "brand hex 색상 하드코딩 금지. 'brand' 토큰을 사용하세요."
        }
      ],
      "no-restricted-imports": [
        "warn",
        {
          "paths": [
            {
              "name": "@/lib/styles",
              "importNames": ["BUTTON_STYLES", "INPUT_STYLES", "CHECKBOX_STYLES", "FILE_INPUT_STYLES"],
              "message": "새 코드에서는 @/components/ui/의 Button, Input, Checkbox 등 컴포넌트를 사용하세요."
            }
          ]
        }
      ]
    }
  }
];

export default eslintConfig;
