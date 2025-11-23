# Grok CLI Tests

This directory contains the test suite for Grok CLI.

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Test Structure

```
tests/
├── utils/              # Utility function tests
│   ├── cache.test.ts       # Cache system tests
│   ├── errors.test.ts      # Error handling tests
│   └── model-utils.test.ts # Model utilities tests
└── README.md           # This file
```

## Writing Tests

We use [Jest](https://jestjs.io/) as our testing framework with TypeScript support via ts-jest.

### Example Test

```typescript
import { myFunction } from '../../src/utils/my-module';

describe('myFunction', () => {
  it('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected output');
  });

  it('should handle edge cases', () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### Best Practices

1. **One test file per source file**: Name test files with `.test.ts` suffix
2. **Descriptive test names**: Use `it('should ...')` format
3. **Group related tests**: Use `describe()` blocks
4. **Test edge cases**: Include tests for error conditions and boundary cases
5. **Use setup/teardown**: Use `beforeEach()`/`afterEach()` for common setup
6. **Mock external dependencies**: Isolate unit tests from external systems

### Testing Async Code

```typescript
it('should handle async operations', async () => {
  const result = await asyncFunction();
  expect(result).toBe('success');
});

it('should handle rejections', async () => {
  await expect(failingAsync()).rejects.toThrow('error message');
});
```

### Mocking

```typescript
// Mock a module
jest.mock('../../src/utils/some-module');

// Mock a function
const mockFn = jest.fn();
mockFn.mockReturnValue('mocked value');
mockFn.mockResolvedValue('async mocked value');

// Verify calls
expect(mockFn).toHaveBeenCalledTimes(1);
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
```

## Coverage Goals

We aim for the following coverage targets:

- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

View coverage report:
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

## Continuous Integration

Tests are automatically run on every push via GitHub Actions. Pull requests must have all tests passing before merge.

## Adding New Tests

When adding new features:

1. Write tests first (TDD approach recommended)
2. Ensure tests cover happy path and error cases
3. Run coverage to identify gaps
4. Update this README if adding new test categories

## Common Test Patterns

### Testing Error Classes

```typescript
it('should create custom error', () => {
  const error = new CustomError('message');
  expect(error.message).toBe('message');
  expect(error.name).toBe('CustomError');
  expect(error).toBeInstanceOf(Error);
});
```

### Testing with Timers

```typescript
jest.useFakeTimers();

it('should handle timeouts', () => {
  const callback = jest.fn();
  setTimeout(callback, 1000);

  jest.advanceTimersByTime(1000);
  expect(callback).toHaveBeenCalled();
});

jest.useRealTimers();
```

### Testing File System Operations

```typescript
import fs from 'fs';

jest.mock('fs');

it('should read file', () => {
  (fs.readFileSync as jest.Mock).mockReturnValue('file content');

  const content = myFileReader('/path/to/file');
  expect(content).toBe('file content');
});
```

## Troubleshooting

### Tests are slow
- Use `jest.setTimeout()` to increase timeout for specific tests
- Consider mocking heavy dependencies
- Run tests in parallel (default Jest behavior)

### Module not found errors
- Ensure `tsconfig.json` is properly configured
- Check jest `moduleNameMapper` in `jest.config.js`

### Coverage not accurate
- Exclude non-testable files in `collectCoverageFrom`
- Ensure all code paths are tested

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Testing TypeScript](https://jestjs.io/docs/getting-started#via-ts-jest)
- [Jest Matchers](https://jestjs.io/docs/expect)
