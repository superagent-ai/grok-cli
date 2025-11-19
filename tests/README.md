# AX CLI Test Suite

This directory contains the comprehensive test suite for the AX CLI project.

## Test Structure

```
tests/
├── example.test.ts           # Basic example tests
├── utils/                    # Utility function tests
│   ├── text-utils.test.ts   # Text manipulation utilities
│   └── token-counter.test.ts # Token counting utilities
└── schemas/                  # Schema validation tests
    └── validation.test.ts    # Zod schema validation
```

## Test Categories

### 1. **Utility Tests** (`tests/utils/`)

#### Text Utils (`text-utils.test.ts`)
Tests for text manipulation and cursor movement:
- Word boundary detection
- Word navigation (find start/end, move to previous/next)
- Word deletion (before/after cursor)
- Line navigation (start/end)
- Character deletion (Unicode-aware)
- Text insertion
- Position tracking

**Coverage**: ~150 test cases covering edge cases like:
- Empty strings
- Unicode and emoji handling (surrogate pairs)
- Multi-line text
- Special characters and punctuation
- Whitespace handling

#### Token Counter (`token-counter.test.ts`)
Tests for token counting functionality:
- Token counting for strings
- Message token counting
- Streaming token estimation
- Token formatting (k/m suffixes)
- Resource cleanup

**Coverage**: ~20 test cases covering:
- Empty strings
- Simple and complex text
- Unicode characters
- Multiple messages
- Tool calls in messages

### 2. **Schema Validation Tests** (`tests/schemas/`)

#### Validation (`validation.test.ts`)
Tests for Zod schema validation:
- User settings validation
- Project settings validation
- MCP server configuration
- Tool execution schemas
- API response schemas
- Safe validation (error handling)

**Coverage**: ~40 test cases covering:
- Valid configurations
- Invalid configurations
- Edge cases (empty, null values)
- Different transport types (stdio, http, sse)
- Required/optional fields
- URL validation
- Error handling

## Running Tests

### All Tests
```bash
npm test
```

### Watch Mode
```bash
npm run test:watch
```

### With Coverage
```bash
npm run test:coverage
```

### Interactive UI
```bash
npm run test:ui
```

### Specific Test File
```bash
npm test tests/utils/text-utils.test.ts
```

## Test Coverage Goals

| Category | Current | Target |
|----------|---------|--------|
| Utilities | ~80% | 90% |
| Schemas | ~90% | 95% |
| Tools | TBD | 70% |
| Hooks | TBD | 60% |
| Overall | TBD | 80% |

## Writing New Tests

### Test File Naming
- Use `.test.ts` suffix
- Mirror source file structure: `src/utils/foo.ts` → `tests/utils/foo.test.ts`

### Test Structure
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { functionToTest } from '../../src/path/to/module';

describe('Module Name', () => {
  describe('functionName', () => {
    it('should handle normal case', () => {
      expect(functionToTest('input')).toBe('expected');
    });

    it('should handle edge case', () => {
      expect(functionToTest('')).toBe('default');
    });

    it('should throw on invalid input', () => {
      expect(() => functionToTest(null)).toThrow();
    });
  });
});
```

### Best Practices
1. **Test one thing per test** - Keep tests focused and specific
2. **Use descriptive names** - Test names should explain what they test
3. **Cover edge cases** - Empty strings, null, undefined, boundaries
4. **Test error paths** - Validate error handling
5. **Mock external dependencies** - Don't test external APIs/services
6. **Clean up resources** - Use beforeEach/afterEach for setup/teardown

## Future Test Areas

### Priority 1 (High Coverage Value)
- [ ] MCP Client tests
- [ ] Tool implementations (bash, text-editor, search)
- [ ] Settings manager
- [ ] Model configuration

### Priority 2 (Medium Coverage Value)
- [ ] Input handlers and hooks
- [ ] Grok agent functionality
- [ ] MCP transports
- [ ] Custom instructions

### Priority 3 (Lower Coverage Value)
- [ ] UI components (limited testability)
- [ ] CLI commands
- [ ] Integration tests

## CI/CD Integration

Tests run automatically on:
- Every push to `main` branch
- Every pull request
- Manual workflow dispatch

See `.github/workflows/test.yml` for CI configuration.

## Coverage Reports

Coverage reports are generated in:
- `coverage/` - HTML coverage report (open `coverage/index.html`)
- Console output - Summary after running tests
- Codecov - Badge in README.md

## Debugging Tests

### VS Code
Add breakpoints and run:
```bash
npm run test:watch
```

### Console Logs
```typescript
it('should debug test', () => {
  const result = functionToTest('input');
  console.log('Result:', result); // Will show in test output
  expect(result).toBe('expected');
});
```

### Vitest UI
```bash
npm run test:ui
```
Opens browser-based test runner with detailed results.

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Zod Documentation](https://zod.dev/)
