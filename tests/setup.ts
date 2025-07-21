// Global test setup
import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';

// Mock console methods to reduce noise in tests
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

beforeAll(() => {
  // Only show console output in debug mode
  if (!process.env.DEBUG_TESTS) {
    console.log = jest.fn();
    console.warn = jest.fn();
    console.error = jest.fn();
  }
});

afterAll(() => {
  // Restore console methods
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  console.error = originalConsoleError;
});

// Helper to create temporary test directories
export async function createTempTestDir(testName: string): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'grok-cli-tests', testName, Date.now().toString());
  await fs.ensureDir(tempDir);
  return tempDir;
}

// Helper to cleanup temp directories
export async function cleanupTempDir(tempDir: string): Promise<void> {
  try {
    await fs.remove(tempDir);
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Mock tiktoken to avoid loading actual encoders in tests
jest.mock('tiktoken', () => ({
  get_encoding: jest.fn(() => ({
    encode: jest.fn((text: string) => new Array(Math.ceil(text.length / 4))),
    free: jest.fn(),
  })),
  encoding_for_model: jest.fn(() => ({
    encode: jest.fn((text: string) => new Array(Math.ceil(text.length / 4))),
    free: jest.fn(),
  })),
}));