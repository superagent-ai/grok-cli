/**
 * JSON Schema validation for tool inputs
 * Provides type-safe validation for tool arguments
 * @module utils/schema-validator
 */

/**
 * JSON Schema type definition
 */
export interface JSONSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object' | 'null';
  properties?: Record<string, JSONSchema>;
  items?: JSONSchema;
  required?: string[];
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  description?: string;
  default?: unknown;
  additionalProperties?: boolean | JSONSchema;
}

/**
 * Validation error details
 */
export interface ValidationError {
  path: string;
  message: string;
  value?: unknown;
  expected?: string;
}

/**
 * Validation result
 */
export interface SchemaValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Tool schema definition
 */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: JSONSchema;
}

/**
 * Validates a value against a JSON Schema
 */
export class SchemaValidator {
  /**
   * Validate a value against a schema
   */
  validate(value: unknown, schema: JSONSchema, path: string = ''): SchemaValidationResult {
    const errors: ValidationError[] = [];

    this.validateValue(value, schema, path, errors);

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private validateValue(
    value: unknown,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    // Handle null values
    if (value === null) {
      if (schema.type !== 'null') {
        errors.push({
          path,
          message: `Expected ${schema.type}, got null`,
          value,
          expected: schema.type,
        });
      }
      return;
    }

    // Handle undefined values
    if (value === undefined) {
      // Undefined is handled by required check
      return;
    }

    // Check type
    const actualType = this.getType(value);
    if (!this.matchesType(actualType, schema.type)) {
      errors.push({
        path,
        message: `Expected ${schema.type}, got ${actualType}`,
        value,
        expected: schema.type,
      });
      return;
    }

    // Type-specific validation
    switch (schema.type) {
      case 'string':
        this.validateString(value as string, schema, path, errors);
        break;
      case 'number':
      case 'integer':
        this.validateNumber(value as number, schema, path, errors);
        break;
      case 'array':
        this.validateArray(value as unknown[], schema, path, errors);
        break;
      case 'object':
        this.validateObject(value as Record<string, unknown>, schema, path, errors);
        break;
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value as string | number | boolean)) {
      errors.push({
        path,
        message: `Value must be one of: ${schema.enum.join(', ')}`,
        value,
        expected: schema.enum.join(' | '),
      });
    }
  }

  private getType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'number' && Number.isInteger(value)) return 'integer';
    return typeof value;
  }

  private matchesType(actual: string, expected: string): boolean {
    if (actual === expected) return true;
    // Integer is also a number
    if (expected === 'number' && actual === 'integer') return true;
    return false;
  }

  private validateString(
    value: string,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      errors.push({
        path,
        message: `String must be at least ${schema.minLength} characters`,
        value,
        expected: `minLength: ${schema.minLength}`,
      });
    }

    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      errors.push({
        path,
        message: `String must be at most ${schema.maxLength} characters`,
        value,
        expected: `maxLength: ${schema.maxLength}`,
      });
    }

    if (schema.pattern) {
      const regex = new RegExp(schema.pattern);
      if (!regex.test(value)) {
        errors.push({
          path,
          message: `String must match pattern: ${schema.pattern}`,
          value,
          expected: `pattern: ${schema.pattern}`,
        });
      }
    }
  }

  private validateNumber(
    value: number,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.type === 'integer' && !Number.isInteger(value)) {
      errors.push({
        path,
        message: 'Value must be an integer',
        value,
        expected: 'integer',
      });
    }

    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push({
        path,
        message: `Value must be at least ${schema.minimum}`,
        value,
        expected: `minimum: ${schema.minimum}`,
      });
    }

    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push({
        path,
        message: `Value must be at most ${schema.maximum}`,
        value,
        expected: `maximum: ${schema.maximum}`,
      });
    }
  }

  private validateArray(
    value: unknown[],
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push({
        path,
        message: `Array must have at least ${schema.minItems} items`,
        value: value.length,
        expected: `minItems: ${schema.minItems}`,
      });
    }

    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push({
        path,
        message: `Array must have at most ${schema.maxItems} items`,
        value: value.length,
        expected: `maxItems: ${schema.maxItems}`,
      });
    }

    if (schema.items) {
      value.forEach((item, index) => {
        this.validateValue(item, schema.items!, `${path}[${index}]`, errors);
      });
    }
  }

  private validateObject(
    value: Record<string, unknown>,
    schema: JSONSchema,
    path: string,
    errors: ValidationError[]
  ): void {
    // Check required properties
    if (schema.required) {
      for (const requiredProp of schema.required) {
        if (!(requiredProp in value) || value[requiredProp] === undefined) {
          errors.push({
            path: path ? `${path}.${requiredProp}` : requiredProp,
            message: `Missing required property: ${requiredProp}`,
            expected: 'required',
          });
        }
      }
    }

    // Validate properties
    if (schema.properties) {
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        if (propName in value) {
          const propPath = path ? `${path}.${propName}` : propName;
          this.validateValue(value[propName], propSchema, propPath, errors);
        }
      }
    }

    // Check additional properties
    if (schema.additionalProperties === false && schema.properties) {
      const allowedProps = new Set(Object.keys(schema.properties));
      for (const propName of Object.keys(value)) {
        if (!allowedProps.has(propName)) {
          errors.push({
            path: path ? `${path}.${propName}` : propName,
            message: `Unknown property: ${propName}`,
            value: value[propName],
          });
        }
      }
    }
  }
}

/**
 * Pre-defined schemas for common tool parameters
 */
export const CommonSchemas = {
  filePath: {
    type: 'string' as const,
    minLength: 1,
    description: 'File path',
  },

  content: {
    type: 'string' as const,
    description: 'File content',
  },

  command: {
    type: 'string' as const,
    minLength: 1,
    maxLength: 10000,
    description: 'Shell command to execute',
  },

  searchQuery: {
    type: 'string' as const,
    minLength: 1,
    maxLength: 1000,
    description: 'Search query',
  },

  positiveInteger: {
    type: 'integer' as const,
    minimum: 1,
    description: 'Positive integer',
  },

  lineNumber: {
    type: 'integer' as const,
    minimum: 1,
    description: 'Line number (1-based)',
  },

  url: {
    type: 'string' as const,
    pattern: '^https?://',
    description: 'HTTP or HTTPS URL',
  },
};

/**
 * Tool schemas for validation
 */
export const ToolSchemas: Record<string, ToolSchema> = {
  view_file: {
    name: 'view_file',
    description: 'View contents of a file or list directory contents',
    parameters: {
      type: 'object',
      properties: {
        path: CommonSchemas.filePath,
        start_line: CommonSchemas.lineNumber,
        end_line: CommonSchemas.lineNumber,
      },
      required: ['path'],
    },
  },

  create_file: {
    name: 'create_file',
    description: 'Create a new file with specified content',
    parameters: {
      type: 'object',
      properties: {
        path: CommonSchemas.filePath,
        content: CommonSchemas.content,
      },
      required: ['path', 'content'],
    },
  },

  str_replace_editor: {
    name: 'str_replace_editor',
    description: 'Replace specific text in a file',
    parameters: {
      type: 'object',
      properties: {
        path: CommonSchemas.filePath,
        old_str: { type: 'string', minLength: 1, description: 'Text to replace' },
        new_str: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences' },
      },
      required: ['path', 'old_str', 'new_str'],
    },
  },

  bash: {
    name: 'bash',
    description: 'Execute a bash command',
    parameters: {
      type: 'object',
      properties: {
        command: CommonSchemas.command,
      },
      required: ['command'],
    },
  },

  search: {
    name: 'search',
    description: 'Search for text content or find files',
    parameters: {
      type: 'object',
      properties: {
        query: CommonSchemas.searchQuery,
        search_type: {
          type: 'string',
          enum: ['text', 'files', 'both'],
          description: 'Type of search',
        },
        include_pattern: { type: 'string', description: 'Glob pattern to include' },
        exclude_pattern: { type: 'string', description: 'Glob pattern to exclude' },
        case_sensitive: { type: 'boolean', description: 'Case-sensitive search' },
        max_results: { type: 'integer', minimum: 1, maximum: 1000, description: 'Max results' },
      },
      required: ['query'],
    },
  },

  web_search: {
    name: 'web_search',
    description: 'Search the web for information',
    parameters: {
      type: 'object',
      properties: {
        query: CommonSchemas.searchQuery,
        max_results: { type: 'integer', minimum: 1, maximum: 20, description: 'Max results' },
      },
      required: ['query'],
    },
  },

  web_fetch: {
    name: 'web_fetch',
    description: 'Fetch and read content from a URL',
    parameters: {
      type: 'object',
      properties: {
        url: CommonSchemas.url,
      },
      required: ['url'],
    },
  },
};

/**
 * Validates tool arguments against the tool's schema
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, unknown>
): SchemaValidationResult {
  const schema = ToolSchemas[toolName];

  if (!schema) {
    return {
      valid: true,
      errors: [],
    };
  }

  const validator = new SchemaValidator();
  return validator.validate(args, schema.parameters);
}

/**
 * Format validation errors for display
 */
export function formatValidationErrors(errors: ValidationError[]): string {
  if (errors.length === 0) {
    return '';
  }

  return errors
    .map((error) => {
      let message = error.path ? `${error.path}: ${error.message}` : error.message;
      if (error.expected) {
        message += ` (expected: ${error.expected})`;
      }
      return `  - ${message}`;
    })
    .join('\n');
}

// Export singleton instance
export const schemaValidator = new SchemaValidator();
