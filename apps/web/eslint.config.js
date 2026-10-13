import base from '@mohonaut/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts', 'playwright-report/**', 'test-results/**'] },
  ...base,
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
];
