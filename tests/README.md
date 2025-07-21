# Test Suite Documentation

This directory contains comprehensive tests for the Grok CLI context management system and related functionality.

## Test Structure

```
tests/
├── setup.ts                           # Global test configuration and utilities
├── unit/                              # Unit tests for individual components
│   ├── context-management.test.ts     # Core context management logic
│   ├── context-window-management.test.ts # Context window pruning and optimization
│   ├── persistence-manager.test.ts    # Data persistence and backup system
│   └── performance.test.ts            # Performance and scalability tests
├── integration/                       # Integration tests for full workflows
│   └── context-management-integration.test.ts # End-to-end context management
└── README.md                         # This file
```

## Test Categories

### Unit Tests

#### Context Management (`context-management.test.ts`)
- **Turn Generation**: Tests unique ID generation and conversation turn structuring
- **Message to Turn Conversion**: Validates proper grouping of messages into coherent conversation turns
- **Active File Extraction**: Tests tracking of files being worked on during conversations
- **Token Calculation**: Validates accurate token counting for turns and messages
- **Turn Completion Detection**: Tests detection of complete vs incomplete conversation turns
- **Message Rebuilding**: Validates reconstruction of message arrays from turn data

#### Context Window Management (`context-window-management.test.ts`)
- **Context Window Enforcement**: Tests 120k token limit enforcement with sliding window
- **Active File Context Management**: Tests prioritization and deduplication of file content
- **Context Window Integration**: Tests integration with message processing workflows
- **Error Handling**: Tests graceful handling of token counting and processing errors

#### Persistence Manager (`persistence-manager.test.ts`)
- **Initialization**: Tests directory creation and configuration
- **Save/Load Operations**: Tests JSON data persistence with error handling
- **File Operations**: Tests file existence checking, deletion, and path resolution
- **Backup System**: Tests automatic backup creation, rotation, and restoration
- **Enable/Disable Functionality**: Tests persistence system enable/disable states
- **Error Resilience**: Tests handling of file system errors and corruption
- **Thread Safety Simulation**: Tests concurrent operations and race conditions

#### Performance Tests (`performance.test.ts`)
- **Context Window Management Performance**: Tests efficiency of turn grouping and token calculation
- **Persistence Performance**: Tests large data saves, concurrent operations, and backup creation
- **Memory Usage**: Tests memory leak prevention and large data structure handling
- **Scalability**: Tests linear performance scaling with conversation size

### Integration Tests

#### Context Management Integration (`context-management-integration.test.ts`)
- **End-to-End Context Management**: Tests complete conversation flows with context pruning
- **Tool Integration**: Tests persistence across context management events
- **User Settings Integration**: Tests configuration persistence and application
- **File Context Management**: Tests active file tracking and prioritization
- **Error Recovery**: Tests system resilience to failures
- **Performance Under Load**: Tests system behavior under high load

## Running Tests

### All Tests
```bash
npm test
```

### Specific Test Suites
```bash
# Unit tests only
npm test -- --testPathPattern=unit

# Integration tests only  
npm test -- --testPathPattern=integration

# Context management specific tests
npm run test:context

# With coverage report
npm run test:coverage
```

### Watch Mode
```bash
npm run test:watch
```

### Debug Mode
```bash
DEBUG_TESTS=1 npm test
```

## Test Configuration

### Jest Configuration (`jest.config.js`)
- **Preset**: `ts-jest` for TypeScript support
- **Environment**: Node.js environment for CLI testing
- **Coverage**: Excludes UI components, includes core logic
- **Timeout**: 30 seconds for integration tests
- **Setup**: Automatic mocking of external dependencies

### Global Setup (`setup.ts`)
- **Console Mocking**: Reduces test noise unless `DEBUG_TESTS=1`
- **Temporary Directories**: Helper functions for test isolation
- **Tiktoken Mocking**: Avoids loading actual encoders in tests
- **Cleanup Utilities**: Ensures test environment cleanliness

## Key Testing Patterns

### Mocking Strategy
- **External APIs**: Grok client mocked to avoid real API calls
- **File System**: Uses temporary directories for isolation
- **Tools**: Individual tool mocks for focused unit testing
- **Tiktoken**: Simple token estimation for predictable testing

### Test Data Generation
- **Realistic Conversations**: Multi-turn conversations with tool usage
- **Large Datasets**: Stress testing with substantial data volumes
- **Edge Cases**: Boundary conditions and error scenarios
- **Performance Scenarios**: Scalability testing with varying loads

### Assertions and Validation
- **Behavioral Testing**: Focuses on expected behaviors over implementation details
- **Performance Bounds**: Validates operation completion times
- **Memory Usage**: Monitors and bounds memory consumption
- **Error Handling**: Ensures graceful degradation

## Coverage Targets

- **Unit Tests**: 90%+ coverage for core context management logic
- **Integration Tests**: Complete workflow validation
- **Performance Tests**: Benchmarking and scalability validation
- **Error Scenarios**: Comprehensive error condition testing

## Test Data and Fixtures

### Mock Conversations
- Simple user-assistant exchanges
- Complex multi-tool conversations  
- File operation sequences
- Error and recovery scenarios

### Performance Test Data
- Varying conversation sizes (10 to 10,000+ messages)
- Large file contents (simulated)
- Concurrent operation scenarios
- Memory stress test datasets

## Debugging Tests

### Common Issues
1. **Timeout Errors**: Increase timeout in specific test or globally
2. **Memory Issues**: Check for proper cleanup in afterEach hooks
3. **File System Errors**: Verify temp directory permissions
4. **Mock Issues**: Ensure mocks are properly reset between tests

### Debugging Commands
```bash
# Run single test file
npm test -- context-management.test.ts

# Run with full output
npm test -- --verbose

# Debug specific test
npm test -- --testNamePattern="should group simple"

# Run without mocking console
DEBUG_TESTS=1 npm test
```

## Contributing Test Cases

### Adding New Tests
1. **Follow Naming Convention**: `describe` blocks for components, `it` blocks for behaviors
2. **Use Proper Setup/Teardown**: Utilize beforeEach/afterEach for isolation
3. **Mock Dependencies**: Mock external dependencies, use real code for testing target
4. **Assert Behaviors**: Test expected outcomes, not implementation details
5. **Include Edge Cases**: Test boundary conditions and error scenarios

### Test Quality Guidelines
- **Readable**: Tests should clearly indicate what is being tested
- **Isolated**: Each test should be independent and rerunnable
- **Deterministic**: Tests should produce consistent results
- **Fast**: Unit tests should complete quickly (< 1 second each)
- **Comprehensive**: Cover happy path, edge cases, and error conditions

This test suite provides comprehensive validation of the context management system, ensuring reliability, performance, and correctness across all operational scenarios.