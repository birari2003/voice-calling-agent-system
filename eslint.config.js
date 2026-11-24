import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '**/.venv/**', '**/*.cjs', '**/.sequelizerc'] },
  ...tseslint.configs.recommended,
  {
    // Integration tests assert on loosely-typed JSON response bodies; application code stays strict.
    files: ['backend/test/integration/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
);
