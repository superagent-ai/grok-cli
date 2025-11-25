/**
 * Tests for JSON Schema validator
 */
import {
  SchemaValidator,
  validateToolArguments,
  formatValidationErrors,
  JSONSchema,
} from '../../src/utils/schema-validator';

describe('SchemaValidator', () => {
  let validator: SchemaValidator;

  beforeEach(() => {
    validator = new SchemaValidator();
  });

  describe('string validation', () => {
    it('should validate string type', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = validator.validate('hello', schema);
      expect(result.valid).toBe(true);
    });

    it('should reject non-string values', () => {
      const schema: JSONSchema = { type: 'string' };
      const result = validator.validate(123, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('Expected string');
    });

    it('should validate minLength', () => {
      const schema: JSONSchema = { type: 'string', minLength: 5 };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('hi', schema).valid).toBe(false);
    });

    it('should validate maxLength', () => {
      const schema: JSONSchema = { type: 'string', maxLength: 5 };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('hello world', schema).valid).toBe(false);
    });

    it('should validate pattern', () => {
      const schema: JSONSchema = { type: 'string', pattern: '^[a-z]+$' };

      expect(validator.validate('hello', schema).valid).toBe(true);
      expect(validator.validate('Hello123', schema).valid).toBe(false);
    });
  });

  describe('number validation', () => {
    it('should validate number type', () => {
      const schema: JSONSchema = { type: 'number' };
      expect(validator.validate(42, schema).valid).toBe(true);
      expect(validator.validate(3.14, schema).valid).toBe(true);
    });

    it('should reject non-number values', () => {
      const schema: JSONSchema = { type: 'number' };
      const result = validator.validate('42', schema);
      expect(result.valid).toBe(false);
    });

    it('should validate minimum', () => {
      const schema: JSONSchema = { type: 'number', minimum: 10 };

      expect(validator.validate(15, schema).valid).toBe(true);
      expect(validator.validate(5, schema).valid).toBe(false);
    });

    it('should validate maximum', () => {
      const schema: JSONSchema = { type: 'number', maximum: 100 };

      expect(validator.validate(50, schema).valid).toBe(true);
      expect(validator.validate(150, schema).valid).toBe(false);
    });
  });

  describe('integer validation', () => {
    it('should validate integer type', () => {
      const schema: JSONSchema = { type: 'integer' };
      expect(validator.validate(42, schema).valid).toBe(true);
    });

    it('should reject non-integers', () => {
      const schema: JSONSchema = { type: 'integer' };
      const result = validator.validate(3.14, schema);
      expect(result.valid).toBe(false);
      expect(result.errors[0].message).toContain('integer');
    });

    it('should accept integer for number type', () => {
      const schema: JSONSchema = { type: 'number' };
      expect(validator.validate(42, schema).valid).toBe(true);
    });
  });

  describe('boolean validation', () => {
    it('should validate boolean type', () => {
      const schema: JSONSchema = { type: 'boolean' };
      expect(validator.validate(true, schema).valid).toBe(true);
      expect(validator.validate(false, schema).valid).toBe(true);
    });

    it('should reject non-boolean values', () => {
      const schema: JSONSchema = { type: 'boolean' };
      expect(validator.validate('true', schema).valid).toBe(false);
      expect(validator.validate(1, schema).valid).toBe(false);
    });
  });

  describe('array validation', () => {
    it('should validate array type', () => {
      const schema: JSONSchema = { type: 'array' };
      expect(validator.validate([1, 2, 3], schema).valid).toBe(true);
    });

    it('should reject non-array values', () => {
      const schema: JSONSchema = { type: 'array' };
      expect(validator.validate({ length: 3 }, schema).valid).toBe(false);
    });

    it('should validate minItems', () => {
      const schema: JSONSchema = { type: 'array', minItems: 2 };

      expect(validator.validate([1, 2], schema).valid).toBe(true);
      expect(validator.validate([1], schema).valid).toBe(false);
    });

    it('should validate maxItems', () => {
      const schema: JSONSchema = { type: 'array', maxItems: 3 };

      expect(validator.validate([1, 2], schema).valid).toBe(true);
      expect(validator.validate([1, 2, 3, 4], schema).valid).toBe(false);
    });

    it('should validate array items', () => {
      const schema: JSONSchema = {
        type: 'array',
        items: { type: 'string' },
      };

      expect(validator.validate(['a', 'b', 'c'], schema).valid).toBe(true);
      expect(validator.validate(['a', 1, 'c'], schema).valid).toBe(false);
    });
  });

  describe('object validation', () => {
    it('should validate object type', () => {
      const schema: JSONSchema = { type: 'object' };
      expect(validator.validate({ key: 'value' }, schema).valid).toBe(true);
    });

    it('should reject non-object values', () => {
      const schema: JSONSchema = { type: 'object' };
      expect(validator.validate([1, 2, 3], schema).valid).toBe(false);
    });

    it('should validate required properties', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name', 'age'],
      };

      expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
      expect(validator.validate({ name: 'John' }, schema).valid).toBe(false);
    });

    it('should validate property types', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
      };

      expect(validator.validate({ name: 'John', age: 30 }, schema).valid).toBe(true);
      expect(validator.validate({ name: 'John', age: 'thirty' }, schema).valid).toBe(false);
    });

    it('should validate nested objects', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
            },
            required: ['name'],
          },
        },
        required: ['user'],
      };

      expect(validator.validate({ user: { name: 'John' } }, schema).valid).toBe(true);
      expect(validator.validate({ user: {} }, schema).valid).toBe(false);
    });

    it('should reject additional properties when additionalProperties is false', () => {
      const schema: JSONSchema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      expect(validator.validate({ name: 'John' }, schema).valid).toBe(true);
      expect(validator.validate({ name: 'John', extra: true }, schema).valid).toBe(false);
    });
  });

  describe('enum validation', () => {
    it('should validate enum values', () => {
      const schema: JSONSchema = {
        type: 'string',
        enum: ['red', 'green', 'blue'],
      };

      expect(validator.validate('red', schema).valid).toBe(true);
      expect(validator.validate('yellow', schema).valid).toBe(false);
    });

    it('should work with numeric enums', () => {
      const schema: JSONSchema = {
        type: 'number',
        enum: [1, 2, 3],
      };

      expect(validator.validate(2, schema).valid).toBe(true);
      expect(validator.validate(5, schema).valid).toBe(false);
    });
  });

  describe('null validation', () => {
    it('should validate null type', () => {
      const schema: JSONSchema = { type: 'null' };
      expect(validator.validate(null, schema).valid).toBe(true);
    });

    it('should reject null for non-null types', () => {
      const schema: JSONSchema = { type: 'string' };
      expect(validator.validate(null, schema).valid).toBe(false);
    });
  });
});

describe('validateToolArguments', () => {
  it('should validate view_file arguments', () => {
    const result = validateToolArguments('view_file', { path: '/home/user/file.txt' });
    expect(result.valid).toBe(true);
  });

  it('should reject view_file without path', () => {
    const result = validateToolArguments('view_file', {});
    expect(result.valid).toBe(false);
    expect(result.errors[0].message).toContain('path');
  });

  it('should validate bash arguments', () => {
    const result = validateToolArguments('bash', { command: 'ls -la' });
    expect(result.valid).toBe(true);
  });

  it('should reject bash with empty command', () => {
    const result = validateToolArguments('bash', { command: '' });
    expect(result.valid).toBe(false);
  });

  it('should validate search arguments', () => {
    const result = validateToolArguments('search', {
      query: 'function',
      search_type: 'text',
    });
    expect(result.valid).toBe(true);
  });

  it('should reject search with invalid search_type', () => {
    const result = validateToolArguments('search', {
      query: 'function',
      search_type: 'invalid',
    });
    expect(result.valid).toBe(false);
  });

  it('should pass for unknown tools', () => {
    const result = validateToolArguments('unknown_tool', { anything: 'goes' });
    expect(result.valid).toBe(true);
  });
});

describe('formatValidationErrors', () => {
  it('should format single error', () => {
    const errors = [{ path: 'name', message: 'is required' }];
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('name');
    expect(formatted).toContain('is required');
  });

  it('should format multiple errors', () => {
    const errors = [
      { path: 'name', message: 'is required' },
      { path: 'age', message: 'must be a number' },
    ];
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('name');
    expect(formatted).toContain('age');
  });

  it('should include expected value', () => {
    const errors = [
      { path: 'count', message: 'must be at least 1', expected: 'minimum: 1' },
    ];
    const formatted = formatValidationErrors(errors);
    expect(formatted).toContain('minimum: 1');
  });

  it('should return empty string for no errors', () => {
    const formatted = formatValidationErrors([]);
    expect(formatted).toBe('');
  });
});
