module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/index.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        lib: ['ES2020', 'DOM'],
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        types: ['node', 'jest'],
      },
    }],
  },
};
