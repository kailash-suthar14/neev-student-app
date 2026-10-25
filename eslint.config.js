// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

/** Screens and UI components must reach data only through feature services/hooks. */
const uiBoundary = {
  files: ['src/app/**/*.{ts,tsx}', 'src/components/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@react-native-async-storage/async-storage',
            message: 'UI must not access storage directly. Use a feature service.',
          },
        ],
        patterns: [
          {
            group: ['@/data/*', '@/data/**'],
            message: 'UI must not import data-layer implementations. Use feature services/hooks.',
          },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'fetch', message: 'UI must not call fetch. Use a repository via a feature service.' },
    ],
  },
};

/** Feature services depend on repository interfaces, never on concrete implementations. */
const featureBoundary = {
  files: ['src/features/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [{ name: '@react-native-async-storage/async-storage', message: 'Use a repository.' }],
        patterns: [
          {
            group: ['@/data/mock/*', '@/data/remote/*', '@/data/local/*'],
            message: 'Depend on @/data/repositories interfaces; wiring belongs in src/config/container.ts.',
          },
        ],
      },
    ],
    'no-restricted-globals': ['error', { name: 'fetch', message: 'Use a repository.' }],
  },
};

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'coverage/*'] },
  uiBoundary,
  featureBoundary,
  {
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.jest } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
]);
