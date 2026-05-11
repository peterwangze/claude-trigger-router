import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: [
        'src/auth/**/*.ts',
        'src/cli.ts',
        'src/doctor/**/*.ts',
        'src/governance/**/*.ts',
        'src/index.ts',
        'src/middleware/auth.ts',
        'src/models/**/*.ts',
        'src/protocols/**/*.ts',
        'src/server.ts',
        'src/setup/**/*.ts',
        'src/trigger/**/*.ts',
        'src/utils/config.ts',
        'src/utils/validation-contract.ts',
      ],
      exclude: ['src/**/*.test.ts', 'src/**/types.ts', 'src/e2e/**', 'src/ui/**'],
    },
  },
});
