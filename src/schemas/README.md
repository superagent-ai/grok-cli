# Schemas

This directory contains Zod schemas for runtime validation and type safety.

## Why Zod?

Zod provides:
- **Runtime validation**: Catch invalid data at runtime
- **Type inference**: TypeScript types derived from schemas
- **Error messages**: Clear validation error messages
- **Type safety**: Ensures data matches expected structure

## Usage Examples

### Validating User Settings

```typescript
import { validateUserSettings, safeValidateUserSettings } from './schemas';

// Throws error if invalid
const settings = validateUserSettings(unknownData);

// Safe parsing with error handling
const result = safeValidateUserSettings(unknownData);
if (result.success) {
  console.log('Valid settings:', result.data);
} else {
  console.error('Validation errors:', result.error.issues);
}
```

### Validating MCP Server Config

```typescript
import { MCPServerConfigSchema } from './schemas';

const config = {
  name: 'my-server',
  transport: 'stdio',
  command: 'bun',
  args: ['server.js'],
};

// Validate and get typed result
const validated = MCPServerConfigSchema.parse(config);
```

### Type Inference

```typescript
import { UserSettings, ProjectSettings } from './schemas';

// Types are automatically inferred from schemas
function loadSettings(settings: UserSettings) {
  // settings.apiKey is typed as string | undefined
  // settings.models is typed as string[] | undefined
}
```

## Best Practices

1. **Always validate external data**: User input, API responses, file contents
2. **Use safe parsing for user-facing code**: Prevents crashes from invalid data
3. **Provide clear error messages**: Help users fix validation errors
4. **Keep schemas close to usage**: Import only what you need
5. **Update schemas when types change**: Keep validation in sync with types

## Adding New Schemas

1. Define schema using `z.object()`, `z.string()`, etc.
2. Export type using `z.infer<typeof YourSchema>`
3. Add validation helper functions if needed
4. Document the schema usage

Example:

```typescript
export const NewFeatureSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  enabled: z.boolean().default(true),
  config: z.record(z.unknown()).optional(),
});

export type NewFeature = z.infer<typeof NewFeatureSchema>;

export function validateNewFeature(data: unknown): NewFeature {
  return NewFeatureSchema.parse(data);
}
```

## References

- [Zod Documentation](https://zod.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html)
