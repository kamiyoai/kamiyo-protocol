/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        skipLibCheck: true,
      },
    }],
  },
  transformIgnorePatterns: [
    'node_modules/(?!@kamiyo)',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
  ],
};
