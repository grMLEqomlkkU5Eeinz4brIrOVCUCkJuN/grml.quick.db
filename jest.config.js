/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    // Bun-runtime tests live here and must not be run by jest.
    testPathIgnorePatterns: ["/node_modules/", "/tests/bun/"],
};
