const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
  {
    ignores: ['out/**', 'node_modules/**', '.vscode-test/**', 'test-fixtures/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
  },
);
