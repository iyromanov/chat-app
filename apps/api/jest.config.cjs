module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.spec.ts'],
  testTimeout: 120000,
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }] },
};
