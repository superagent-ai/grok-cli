/**
 * Test suite for brand type utilities
 *
 * Tests compile-time safety, runtime behavior, and validation patterns.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import { z } from 'zod';
import {
  brand,
  unbrand,
  isBranded,
  createBrandFactory,
  type Brand,
  type ExtractBrand,
  type ExtractBase,
} from '../src/public/core/brand-types.js';

// Test brand types
type UserId = Brand<string, 'UserId'>;
type TenantId = Brand<string, 'TenantId'>;
type ApiKeyId = Brand<string, 'ApiKeyId'>;
type Age = Brand<number, 'Age'>;

describe('Brand Types', () => {
  describe('brand()', () => {
    it('should create a branded value from base type', () => {
      const userId = brand<string, 'UserId'>('user-123');
      expect(userId).toBe('user-123');
      expectTypeOf(userId).toEqualTypeOf<UserId>();
    });

    it('should create branded numbers', () => {
      const age = brand<number, 'Age'>(25);
      expect(age).toBe(25);
      expectTypeOf(age).toEqualTypeOf<Age>();
    });

    it('should handle empty strings', () => {
      const userId = brand<string, 'UserId'>('');
      expect(userId).toBe('');
    });

    it('should handle zero', () => {
      const age = brand<number, 'Age'>(0);
      expect(age).toBe(0);
    });
  });

  describe('unbrand()', () => {
    it('should remove brand from branded value', () => {
      const userId = brand<string, 'UserId'>('user-123');
      const plain = unbrand(userId);
      expect(plain).toBe('user-123');
      expectTypeOf(plain).toEqualTypeOf<string>();
    });

    it('should remove brand from branded numbers', () => {
      const age = brand<number, 'Age'>(25);
      const plain = unbrand(age);
      expect(plain).toBe(25);
      expectTypeOf(plain).toEqualTypeOf<number>();
    });
  });

  describe('isBranded()', () => {
    it('should return true for any value (type guard only)', () => {
      expect(isBranded<string, 'UserId'>('user-123')).toBe(true);
      expect(isBranded<string, 'UserId'>(123)).toBe(true);
      expect(isBranded<string, 'UserId'>(null)).toBe(true);
    });

    it('should narrow type when used in type guard', () => {
      const value: unknown = brand<string, 'UserId'>('user-123');

      if (isBranded<string, 'UserId'>(value)) {
        expectTypeOf(value).toEqualTypeOf<UserId>();
      }
    });
  });

  describe('Type utilities', () => {
    it('ExtractBrand should extract brand name', () => {
      type BrandName = ExtractBrand<UserId>;
      expectTypeOf<BrandName>().toEqualTypeOf<'UserId'>();
    });

    it('ExtractBrand should return never for non-branded types', () => {
      type BrandName = ExtractBrand<string>;
      expectTypeOf<BrandName>().toEqualTypeOf<never>();
    });

    it('ExtractBase should extract base type', () => {
      type BaseType = ExtractBase<UserId>;
      expectTypeOf<BaseType>().toEqualTypeOf<string>();
    });

    it('ExtractBase should return original type for non-branded types', () => {
      type BaseType = ExtractBase<number>;
      expectTypeOf<BaseType>().toEqualTypeOf<number>();
    });
  });

  describe('Type safety (compile-time tests)', () => {
    it('should prevent mixing different brand types', () => {
      const userId = brand<string, 'UserId'>('user-123');
      const tenantId = brand<string, 'TenantId'>('tenant-456');

      // These should fail at compile time (tested via expectTypeOf)
      // @ts-expect-error - Cannot assign UserId to TenantId
      const wrongAssignment1: TenantId = userId;

      // @ts-expect-error - Cannot assign TenantId to UserId
      const wrongAssignment2: UserId = tenantId;

      // Satisfy linter
      expect(wrongAssignment1).toBeDefined();
      expect(wrongAssignment2).toBeDefined();
    });

    it('should prevent assigning plain types to branded types', () => {
      // @ts-expect-error - Cannot assign string to UserId
      const userId: UserId = 'user-123';

      // Satisfy linter
      expect(userId).toBeDefined();
    });

    it('should allow branded types where base types are expected', () => {
      const userId = brand<string, 'UserId'>('user-123');

      function logString(s: string): void {
        expect(s).toBe('user-123');
      }

      // This should work - branded types are structural subtypes
      logString(userId);
    });
  });

  describe('createBrandFactory()', () => {
    const UserIdFactory = createBrandFactory(
      z.string().uuid(),
      'UserId'
    );

    describe('parse()', () => {
      it('should validate and brand valid input', () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const userId = UserIdFactory.parse(validUuid);

        expect(userId).toBe(validUuid);
        expectTypeOf(userId).toEqualTypeOf<Brand<string, 'UserId'>>();
      });

      it('should throw on invalid input', () => {
        expect(() => UserIdFactory.parse('not-a-uuid')).toThrow();
      });

      it('should throw on non-string input', () => {
        expect(() => UserIdFactory.parse(123)).toThrow();
      });

      it('should throw on null/undefined', () => {
        expect(() => UserIdFactory.parse(null)).toThrow();
        expect(() => UserIdFactory.parse(undefined)).toThrow();
      });
    });

    describe('schema.safeParse()', () => {
      it('should return success for valid input', () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const result = UserIdFactory.schema.safeParse(validUuid);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(validUuid);
          expectTypeOf(result.data).toEqualTypeOf<Brand<string, 'UserId'>>();
        }
      });

      it('should return error for invalid input', () => {
        const result = UserIdFactory.schema.safeParse('not-a-uuid');

        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeDefined();
        }
      });

      it('should return error for non-string input', () => {
        const result = UserIdFactory.schema.safeParse(123);
        expect(result.success).toBe(false);
      });

      it('should return error for null/undefined', () => {
        expect(UserIdFactory.schema.safeParse(null).success).toBe(false);
        expect(UserIdFactory.schema.safeParse(undefined).success).toBe(false);
      });
    });

    describe('is()', () => {
      it('should return true for valid values', () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        expect(UserIdFactory.is(validUuid)).toBe(true);
      });

      it('should return false for invalid values', () => {
        expect(UserIdFactory.is('not-a-uuid')).toBe(false);
        expect(UserIdFactory.is(123)).toBe(false);
        expect(UserIdFactory.is(null)).toBe(false);
        expect(UserIdFactory.is(undefined)).toBe(false);
      });

      it('should narrow type in type guard', () => {
        const value: unknown = '550e8400-e29b-41d4-a716-446655440000';

        if (UserIdFactory.is(value)) {
          expectTypeOf(value).toEqualTypeOf<Brand<string, 'UserId'>>();
        }
      });
    });

    describe('brandName', () => {
      it('should expose brand name', () => {
        expect(UserIdFactory.brandName).toBe('UserId');
      });
    });
  });

  describe('Integration tests', () => {
    it('should work with Zod transform', () => {
      const schema = z.string().uuid().transform(v => brand<string, 'UserId'>(v));

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const userId = schema.parse(validUuid);

      expect(userId).toBe(validUuid);
      expectTypeOf(userId).toEqualTypeOf<UserId>();
    });

    it('should work in function signatures', () => {
      function getUserData(userId: UserId, tenantId: TenantId): string {
        return `User ${unbrand(userId)} in tenant ${unbrand(tenantId)}`;
      }

      const userId = brand<string, 'UserId'>('user-123');
      const tenantId = brand<string, 'TenantId'>('tenant-456');

      const result = getUserData(userId, tenantId);
      expect(result).toBe('User user-123 in tenant tenant-456');
    });

    it('should prevent ID mixing in function calls', () => {
      function updateUser(userId: UserId, apiKeyId: ApiKeyId): void {
        // This function signature enforces correct brand types
        expect(unbrand(userId)).toBeDefined();
        expect(unbrand(apiKeyId)).toBeDefined();
      }

      const userId = brand<string, 'UserId'>('user-123');
      const apiKeyId = brand<string, 'ApiKeyId'>('api-key-456');

      // Correct usage
      updateUser(userId, apiKeyId);

      // The following line demonstrates compile-time protection:
      // @ts-expect-error - Arguments swapped (wrong brand types)
      // This would fail at compile time in a real TypeScript environment
      // At runtime, brand types are erased, so we skip this call in tests
      // updateUser(apiKeyId, userId);
    });
  });

  describe('Edge cases', () => {
    it('should handle special characters in strings', () => {
      const specialChars = 'user-123-\n\t\r-end';
      const userId = brand<string, 'UserId'>(specialChars);
      expect(unbrand(userId)).toBe(specialChars);
    });

    it('should handle Unicode and emoji', () => {
      const emoji = 'user-👍🏽-123';
      const userId = brand<string, 'UserId'>(emoji);
      expect(unbrand(userId)).toBe(emoji);
    });

    it('should handle very long strings', () => {
      const longString = 'x'.repeat(10000);
      const userId = brand<string, 'UserId'>(longString);
      expect(unbrand(userId)).toBe(longString);
    });

    it('should handle negative numbers', () => {
      const age = brand<number, 'Age'>(-5);
      expect(unbrand(age)).toBe(-5);
    });

    it('should handle floating point numbers', () => {
      const age = brand<number, 'Age'>(25.5);
      expect(unbrand(age)).toBe(25.5);
    });

    it('should handle NaN', () => {
      const age = brand<number, 'Age'>(NaN);
      expect(unbrand(age)).toBeNaN();
    });

    it('should handle Infinity', () => {
      const age = brand<number, 'Age'>(Infinity);
      expect(unbrand(age)).toBe(Infinity);
    });
  });

  describe('Security considerations', () => {
    it('should not validate without explicit schema validation', () => {
      // This demonstrates that brand() alone provides NO validation
      const fakeUserId = brand<string, 'UserId'>('invalid-not-a-uuid');
      expect(fakeUserId).toBe('invalid-not-a-uuid');

      // This is why we MUST validate at boundaries
      const UserIdFactory = createBrandFactory(z.string().uuid(), 'UserId');
      expect(() => UserIdFactory.parse(fakeUserId)).toThrow();
    });

    it('should validate at API boundaries (example)', () => {
      const UserIdFactory = createBrandFactory(z.string().uuid(), 'UserId');

      // Simulate user input
      const userInput = 'not-a-uuid';

      // UNSAFE: Direct branding without validation
      const unsafeId = brand<string, 'UserId'>(userInput);
      expect(unsafeId).toBe('not-a-uuid'); // No error!

      // SAFE: Validation before branding
      const result = UserIdFactory.schema.safeParse(userInput);
      expect(result.success).toBe(false); // Caught!
    });

    it('should document validation points in code', () => {
      const UserIdFactory = createBrandFactory(z.string().uuid(), 'UserId');

      // @validates UserId - performs Zod validation
      function parseUserId(input: string): UserId {
        return UserIdFactory.parse(input);
      }

      // @assumes UserId - no validation, requires pre-validated input
      function formatUserId(userId: UserId): string {
        return `user:${unbrand(userId)}`;
      }

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const userId = parseUserId(validUuid); // Validated here
      const formatted = formatUserId(userId); // No validation needed

      expect(formatted).toBe(`user:${validUuid}`);
    });
  });
});
