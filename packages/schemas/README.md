# @ax-cli/schemas

Single Source of Truth (SSOT) Type System for AX CLI.

This package provides centralized Zod schemas, brand types, and enums for the entire ax-cli ecosystem, ensuring type safety and runtime validation across all modules.

## Installation

```bash
npm install @ax-cli/schemas
```

## What is Single Source of Truth (SSOT)?

**單一真相來源（SSOT）**：所有模組 (API / MCP / Usage) 共享同一套型別定義契約。

Before @ax-cli/schemas, type definitions were scattered across the codebase, leading to:
- Duplicated schema definitions
- Inconsistent validation logic
- Type mismatches between modules
- High refactoring costs

### Architecture: Before vs. After

**BEFORE** (Distributed, Inconsistent):
```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Handler   │     │   MCP Adapter   │     │  Usage Module   │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ • Own schemas   │     │ • Own schemas   │     │ • Own schemas   │
│ • Own types     │     │ • Own types     │     │ • Own types     │
│ • Own enums     │     │ • Own enums     │     │ • Own enums     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
      ❌                       ❌                       ❌
   Duplicated              Duplicated              Duplicated
   Diverges over time      Diverges over time      Diverges over time
```

**AFTER** (Centralized, Consistent):
```
                    ┌──────────────────────────────┐
                    │      @ax-cli/schemas         │
                    ├──────────────────────────────┤
                    │ • Brand Types (ID safety)    │
                    │ • Centralized Enums          │
                    │ • Zod Schemas (validation)   │
                    │ • TypeScript Types           │
                    └───────────────┬──────────────┘
                                    │
                      ┌─────────────┼─────────────┐
                      │             │             │
                      ▼             ▼             ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │ API Handler │ │ MCP Adapter │ │Usage Module │
            ├─────────────┤ ├─────────────┤ ├─────────────┤
            │ import {...}│ │ import {...}│ │ import {...}│
            │ from        │ │ from        │ │ from        │
            │ '@ax-cli/   │ │ '@ax-cli/   │ │ '@ax-cli/   │
            │  schemas'   │ │  schemas'   │ │  schemas'   │
            └─────────────┘ └─────────────┘ └─────────────┘
                  ✅               ✅               ✅
              Same contract   Same contract   Same contract
```

### Benefits

**1. Zero Divergence**
All modules consume the same source - when you update `ModelId` schema, all consumers get the update automatically.

**2. Reduced Refactoring Cost**
Change once in `@ax-cli/schemas`, propagate everywhere. No need to hunt down all duplicate definitions.

**3. Compile-Time Safety**
TypeScript catches type mismatches across module boundaries:
```typescript
// API handler expects ModelId
function handleRequest(model: ModelId) { ... }

// MCP adapter provides ModelId (same type!)
const mcpModel = ModelIdSchema.parse(input);
handleRequest(mcpModel);  // ✅ Type-safe!

// Usage module also uses ModelId (same type!)
const usageModel = getModelFromDB();  // Returns ModelId
handleRequest(usageModel);  // ✅ Type-safe!
```

**4. Runtime Validation Consistency**
All modules use the same Zod schemas, ensuring consistent validation rules across API boundaries, MCP adapters, and usage tracking.

## Features

- **Brand Types**: Compile-time nominal typing for ID types to prevent mixing
- **Centralized Enums**: Single source of truth for all enum values
- **Zod Schemas**: Runtime validation with TypeScript type inference
- **Zero Runtime Cost**: Brand types are compile-time only (erased during compilation)
- **100% Test Coverage**: Comprehensive test suite (123 tests)

## Quick Start

### Using Brand Types

```typescript
import { ModelId, ModelIdSchema } from '@ax-cli/schemas';

// ✅ Safe: Runtime validation + branding
const modelId = ModelIdSchema.parse('glm-4.6');

// ✅ Type-safe function signatures
function getModelConfig(id: ModelId) {
  // TypeScript prevents passing other ID types here
}

// ❌ Compile error: Can't pass plain string
getModelConfig('glm-4.6'); // TypeScript error!

// ✅ Correct: Parse first
getModelConfig(ModelIdSchema.parse('glm-4.6'));
```

### Using Enums

```typescript
import { MessageRoleEnum, type MessageRole } from '@ax-cli/schemas';

// ✅ Use in Zod schemas
const MessageSchema = z.object({
  role: MessageRoleEnum,
  content: z.string(),
});

// ✅ Use type for function signatures
function handleMessage(role: MessageRole, content: string) {
  // role is typed as 'system' | 'user' | 'assistant' | 'tool'
}
```

## API Reference

### Brand Types

All ID types are branded to prevent accidental mixing:

```typescript
import {
  ApiResponseId,
  ToolCallId,
  ModelId,
  MCPServerId,
  // ... and their corresponding schemas
  ApiResponseIdSchema,
  ToolCallIdSchema,
  ModelIdSchema,
  MCPServerIdSchema,
} from '@ax-cli/schemas';
```

**Available Brand Types:**
- `ApiResponseId` / `ApiResponseIdSchema`
- `ToolCallId` / `ToolCallIdSchema`
- `ModelId` / `ModelIdSchema`
- `TenantId` / `TenantIdSchema`
- `ApiKeyId` / `ApiKeyIdSchema`
- `MCPServerId` / `MCPServerIdSchema`
- `UsageRecordId` / `UsageRecordIdSchema`
- `PlanId` / `PlanIdSchema`
- `SessionId` / `SessionIdSchema`
- `RequestId` / `RequestIdSchema`

### Enums

```typescript
import {
  MessageRoleEnum,
  FinishReasonEnum,
  TransportEnum,
  EditorCommandEnum,
} from '@ax-cli/schemas';
```

**MessageRoleEnum**: `'system' | 'user' | 'assistant' | 'tool'`

**FinishReasonEnum**: `'stop' | 'length' | 'tool_calls' | 'content_filter'`

**TransportEnum**: `'stdio' | 'http' | 'sse'`

**EditorCommandEnum**: `'view' | 'create' | 'str_replace' | 'insert' | 'undo_edit'`

### Brand Type Utilities

```typescript
import {
  brand,
  unbrand,
  isBranded,
  createBrandFactory,
  type Brand,
} from '@ax-cli/schemas';

// Create custom brand types
const MyIdSchema = z.string().transform((val) => brand<string, 'MyId'>(val));
type MyId = Brand<string, 'MyId'>;

// Remove branding (use sparingly!)
const plainString = unbrand(brandedId);

// Check if value is branded
if (isBranded(value, 'ModelId')) {
  // TypeScript knows this is a ModelId
}
```

## Security Best Practices

### CRITICAL: Brand Types Are Compile-Time Only

Brand types provide **ZERO runtime validation**. You **MUST** validate all external inputs at system boundaries.

```typescript
// ❌ UNSAFE: No runtime validation!
const tenantId = userInput as TenantId; // DON'T DO THIS!

// ✅ SAFE: Validates with Zod
const result = TenantIdSchema.safeParse(userInput);
if (result.success) {
  const tenantId = result.data; // Type-safe AND runtime-safe
}
```

### When to Validate

Always validate at these boundaries:

- **API boundaries**: HTTP requests, MCP inputs
- **File I/O**: Reading configs, user settings
- **Database queries**: WHERE clauses with user IDs
- **Environment variables**
- **Command-line arguments**

### Safe Validation Pattern

```typescript
import { ModelIdSchema, type ModelId } from '@ax-cli/schemas';

function updateModel(modelName: string): void {
  // ✅ Validate at boundary
  const result = ModelIdSchema.safeParse(modelName);

  if (!result.success) {
    throw new Error(`Invalid model ID: ${result.error.message}`);
  }

  // Now we have a branded ModelId
  const modelId: ModelId = result.data;

  // Use in type-safe functions
  processModel(modelId);
}

function processModel(id: ModelId): void {
  // TypeScript ensures only ModelId can be passed here
  // No accidental mixing with other ID types!
}
```

## Migration Guide

### Adding Brand Types to Existing Code

**Step 1**: Import the schema

```typescript
import { ModelIdSchema } from '@ax-cli/schemas';
```

**Step 2**: Use `.parse()` at object creation boundaries

```typescript
// Before
const config = {
  model: 'glm-4.6',  // Plain string
};

// After
const config = {
  model: ModelIdSchema.parse('glm-4.6'),  // Branded ModelId
};
```

**Step 3**: Update function signatures

```typescript
// Before
function getConfig(model: string) { }

// After
function getConfig(model: ModelId) { }
```

**Step 4**: Fix TypeScript errors by adding `.parse()` at call sites

```typescript
// Before
getConfig('glm-4.6');  // Now causes TypeScript error

// After
getConfig(ModelIdSchema.parse('glm-4.6'));  // Type-safe!
```

### Default Values

For constants and defaults, parse at definition:

```typescript
import { ModelIdSchema } from '@ax-cli/schemas';

const DEFAULT_CONFIG = {
  model: ModelIdSchema.parse('glm-4.6'),
  // ... other fields
};
```

## Performance

- **Brand types**: Zero runtime cost (compile-time only)
- **Zod validation**: ~1-2μs per validation (negligible)
- **Test performance**: 123 tests in <20ms

## Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Type checking
npm run typecheck

# Build
npm run build
```

## Architecture

```
packages/schemas/
├── src/
│   ├── index.ts                    # Public API
│   ├── public/
│   │   └── core/
│   │       ├── brand-types.ts      # Brand type utilities
│   │       ├── enums.ts            # Centralized enums
│   │       └── id-types.ts         # ID brand types
│   └── __tests__/
│       ├── brand-types.test.ts     # 40 tests
│       ├── enums.test.ts           # 31 tests
│       └── id-types.test.ts        # 52 tests
└── dist/                           # Compiled output
```

## Version

Current version: 0.1.0

## License

MIT

## Related Packages

- `@ax-cli/schemas` (this package): Type system foundation
- `ax-cli`: Main CLI application

## Contributing

When adding new brand types or enums:

1. Add implementation to `src/public/core/`
2. Export from `src/index.ts`
3. Add comprehensive tests
4. Update this README
5. Run `npm test` and `npm run typecheck`

## Support

For issues and questions, please open an issue in the main ax-cli repository.
