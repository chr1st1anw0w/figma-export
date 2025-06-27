module.exports = {
  // 測試環境
  testEnvironment: 'node',
  
  // 測試檔案模式
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // 覆蓋率收集
  collectCoverage: true,
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/**/*.test.js',
    '!src/**/__tests__/**',
    '!**/node_modules/**'
  ],
  
  // 覆蓋率報告格式
  coverageReporters: [
    'text',
    'lcov',
    'html'
  ],
  
  // 覆蓋率輸出目錄
  coverageDirectory: 'coverage',
  
  // 覆蓋率閾值
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // 設定檔案
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // 測試超時時間
  testTimeout: 30000,
  
  // 詳細輸出
  verbose: true,
  
  // 清理模擬
  clearMocks: true,
  restoreMocks: true,
  
  // 忽略的路徑
  testPathIgnorePatterns: [
    '/node_modules/',
    '/coverage/',
    '/dist/',
    '/build/'
  ],
  
  // 模組路徑映射
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1'
  },
  
  // 全域變數
  globals: {
    'NODE_ENV': 'test'
  },
  
  // 轉換忽略模式
  transformIgnorePatterns: [
    'node_modules/(?!(chalk|ora)/)'
  ]
};