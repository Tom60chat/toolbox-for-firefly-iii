import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';
import vueI18n from '@intlify/eslint-plugin-vue-i18n';

export default [
  // Global ignores
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.json', '**/*.yml', '**/*.yaml', '**/*.md'],
  },

  // Base JavaScript recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // Vue recommended rules
  ...pluginVue.configs['flat/recommended'],

  // Vue I18n plugin rules
  ...vueI18n.configs['flat/recommended'],

  // Prettier compatibility (disables conflicting rules)
  eslintConfigPrettier,

  // Custom configuration for all files
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals
        process: 'readonly',
        console: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        Buffer: 'readonly',
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        File: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        FileReader: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLFormElement: 'readonly',
        Event: 'readonly',
        DragEvent: 'readonly',
        WheelEvent: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        crypto: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  // Vue-specific configuration
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  // Vue I18n specific settings
  {
    files: ['**/*.vue', '**/*.ts', '**/*.js'],
    settings: {
      'vue-i18n': {
        localeDir: './src/client/locales/*.json',
        messageSyntaxVersion: '^9.0.0',
      },
    },
    rules: {
      '@intlify/vue-i18n/no-unused-keys': 'warn',
      '@intlify/vue-i18n/no-missing-keys': 'error',
      '@intlify/vue-i18n/no-raw-text': 'off', // Can be enabled if you want to enforce i18n for all text
      '@intlify/vue-i18n/key-format-style': ['warn', 'camelCase'],
    },
  },

  // Test files - allow 'any' for mocking
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
