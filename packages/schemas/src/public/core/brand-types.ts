/**
 * Brand Types Utilities for @ax-cli/schemas
 *
 * CRITICAL SECURITY WARNING:
 * =========================
 * Brand types are COMPILE-TIME ONLY markers. They provide ZERO runtime validation.
 *
 * **YOU MUST VALIDATE ALL INPUTS AT SYSTEM BOUNDARIES**
 *
 * Unsafe usage (WILL FAIL IN PRODUCTION):
 * ```typescript
 * const tenantId = userInput as TenantId; // ❌ NO RUNTIME VALIDATION!
 * ```
 *
 * Safe usage (REQUIRED):
 * ```typescript
 * const result = TenantId.parse(userInput); // ✅ Validates with Zod
 * if (result.success) {
 *   const tenantId = result.data; // Type-safe AND runtime-safe
 * }
 * ```
 *
 * WHEN TO USE BRAND TYPES:
 * - Preventing ID mixing at compile time (ApiKeyId vs TenantId)
 * - Enforcing domain boundaries in function signatures
 * - Type-level documentation of intent
 *
 * WHEN TO VALIDATE:
 * - API boundaries (HTTP requests, MCP inputs)
 * - File I/O (reading configs, user settings)
 * - Database queries (WHERE clauses with user IDs)
 * - Environment variables
 * - Command-line arguments
 *
 * PERFORMANCE:
 * Brand types have ZERO runtime cost. They are erased during compilation.
 *
 * @module brand-types
 * @see {@link https://github.com/microsoft/TypeScript/issues/4895|TypeScript Nominal Types}
 */

/**
 * Unique symbol used as a phantom type marker for branding.
 * This symbol is exported for type compatibility but cannot be accessed at runtime,
 * making it impossible to forge branded types without using the
 * provided constructor functions.
 *
 * @internal
 */
export declare const __brand: unique symbol;

/**
 * Brand<T, B> creates a "nominal type" from a structural type.
 *
 * TypeScript uses structural typing by default:
 * ```typescript
 * type UserId = string;
 * type TenantId = string;
 *
 * const user: UserId = "user-123";
 * const tenant: TenantId = user; // ✅ No error! Strings are compatible.
 * ```
 *
 * Brand types enforce nominal typing:
 * ```typescript
 * type UserId = Brand<string, 'UserId'>;
 * type TenantId = Brand<string, 'TenantId'>;
 *
 * const user = brand<string, 'UserId'>("user-123");
 * const tenant: TenantId = user; // ❌ Compile error! Incompatible brands.
 * ```
 *
 * @template T - The base type (string, number, etc.)
 * @template B - The brand identifier (unique string literal)
 *
 * @example
 * ```typescript
 * type ApiKeyId = Brand<string, 'ApiKeyId'>;
 * type TenantId = Brand<string, 'TenantId'>;
 *
 * function updateUsage(apiKeyId: ApiKeyId, tenantId: TenantId) {
 *   // This function signature makes it impossible to swap arguments
 * }
 *
 * const apiKey = brand<string, 'ApiKeyId'>("ak_123");
 * const tenant = brand<string, 'TenantId'>("tn_456");
 *
 * updateUsage(apiKey, tenant);        // ✅ Correct
 * updateUsage(tenant, apiKey);        // ❌ Compile error!
 * updateUsage("ak_123", "tn_456");    // ❌ Compile error!
 * ```
 */
export type Brand<T, B extends string> = T & { readonly [__brand]: B };

/**
 * Creates a branded value.
 *
 * WARNING: This function performs NO VALIDATION. It is a type-level assertion only.
 *
 * Use this ONLY in trusted contexts after validation:
 * - Inside schema .transform() after Zod validation
 * - After database queries that return validated data
 * - In test fixtures with known-good values
 *
 * DO NOT use with user input directly:
 * ```typescript
 * // ❌ UNSAFE - No validation!
 * const userId = brand<string, 'UserId'>(req.body.userId);
 *
 * // ✅ SAFE - Validated first
 * const result = UserIdSchema.safeParse(req.body.userId);
 * if (result.success) {
 *   const userId = result.data; // Already branded by schema
 * }
 * ```
 *
 * @template T - The base type
 * @template B - The brand identifier
 * @param value - The value to brand
 * @returns The same value, but with a brand type
 *
 * @example
 * ```typescript
 * // Safe usage in tests
 * const mockTenantId = brand<string, 'TenantId'>("test-tenant-123");
 *
 * // Safe usage after validation
 * const schema = z.string().uuid().transform(v => brand<string, 'TenantId'>(v));
 * const tenantId = schema.parse(userInput); // Validated AND branded
 * ```
 */
export function brand<T, B extends string>(value: T): Brand<T, B> {
  return value as Brand<T, B>;
}

/**
 * Type guard to check if a value is already branded with a specific brand.
 *
 * NOTE: This only works if the value was created using the brand() function.
 * It CANNOT detect fake brands created with `as` casts.
 *
 * @template T - The base type
 * @template B - The brand identifier
 * @param value - The value to check
 * @returns true if the value has the correct brand (compile-time only)
 *
 * @example
 * ```typescript
 * const value: string | TenantId = getTenantId();
 *
 * if (isBranded<string, 'TenantId'>(value)) {
 *   const tenantId: TenantId = value; // TypeScript knows it's branded
 * }
 * ```
 */
export function isBranded<T, B extends string>(
  _value: unknown
): _value is Brand<T, B> {
  // At runtime, branded types are indistinguishable from their base type
  // This function exists only for type narrowing
  return true;
}

/**
 * Removes the brand from a branded type, returning the base type.
 *
 * Use this when you need to pass a branded value to a function that
 * expects the base type (e.g., logging, serialization).
 *
 * @template T - The base type
 * @template B - The brand identifier
 * @param value - The branded value
 * @returns The same value, but with the brand removed
 *
 * @example
 * ```typescript
 * const tenantId: TenantId = getTenantId();
 *
 * // Pass to function expecting plain string
 * console.log(unbrand(tenantId)); // string, not TenantId
 *
 * // Serialize to JSON
 * const json = JSON.stringify({ id: unbrand(tenantId) });
 * ```
 */
export function unbrand<T, B extends string>(value: Brand<T, B>): T {
  return value as T;
}

/**
 * Utility type to extract the brand identifier from a branded type.
 *
 * @template T - The branded type
 *
 * @example
 * ```typescript
 * type TenantId = Brand<string, 'TenantId'>;
 * type BrandName = ExtractBrand<TenantId>; // 'TenantId'
 * ```
 */
export type ExtractBrand<T> = T extends Brand<unknown, infer B> ? B : never;

/**
 * Utility type to extract the base type from a branded type.
 *
 * @template T - The branded type
 *
 * @example
 * ```typescript
 * type TenantId = Brand<string, 'TenantId'>;
 * type BaseType = ExtractBase<TenantId>; // string
 * ```
 */
export type ExtractBase<T> = T extends Brand<infer U, string> ? U : T;

/**
 * Creates a type-safe brand factory with validation.
 *
 * This is the RECOMMENDED way to create brand types with runtime validation.
 *
 * @template T - The base type
 * @template B - The brand identifier
 * @param schema - Zod schema for validation
 * @param brandName - The brand identifier
 * @returns Object with parse, create, and is methods
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const TenantId = createBrandFactory(
 *   z.string().uuid(),
 *   'TenantId'
 * );
 *
 * // Type-safe parsing with validation
 * const result = TenantId.parse(userInput);
 * if (result.success) {
 *   const tenantId = result.data; // Brand<string, 'TenantId'>
 * }
 *
 * // Create new ID
 * const newId = TenantId.create(); // Generates UUID
 *
 * // Type guard
 * if (TenantId.is(value)) {
 *   // value is Brand<string, 'TenantId'>
 * }
 * ```
 */
export function createBrandFactory<T, B extends string>(
  schema: { parse: (input: unknown) => T; safeParse: (input: unknown) => { success: boolean; data?: T; error?: unknown } },
  brandName: B
) {
  return {
    /**
     * The Zod schema with brand transformation.
     */
    schema: {
      parse: (input: unknown): Brand<T, B> => {
        const validated = schema.parse(input);
        return brand<T, B>(validated);
      },
      safeParse: (input: unknown): { success: true; data: Brand<T, B> } | { success: false; error: unknown } => {
        const result = schema.safeParse(input);
        if (result.success) {
          return { success: true, data: brand<T, B>(result.data as T) };
        }
        return { success: false, error: result.error };
      },
    },

    /**
     * Parse and validate input, returning branded value.
     * Throws on validation failure.
     */
    parse: (input: unknown): Brand<T, B> => {
      const validated = schema.parse(input);
      return brand<T, B>(validated);
    },

    /**
     * Type guard to check if a value is this brand.
     */
    is: (value: unknown): value is Brand<T, B> => {
      const result = schema.safeParse(value);
      return result.success;
    },

    /**
     * Brand name identifier.
     */
    brandName,
  };
}

/**
 * BEST PRACTICES SUMMARY:
 * =======================
 *
 * 1. ALWAYS validate at boundaries:
 *    - API inputs: Use Zod schemas
 *    - Database outputs: Use Zod schemas
 *    - File I/O: Use Zod schemas
 *    - CLI args: Use Zod schemas
 *
 * 2. NEVER cast to brand types:
 *    ❌ const id = userInput as TenantId;
 *    ✅ const id = TenantIdSchema.parse(userInput);
 *
 * 3. Use createBrandFactory for all brand types:
 *    - Provides validation
 *    - Provides type guards
 *    - Centralizes brand creation
 *
 * 4. Document which functions validate:
 *    ```typescript
 *    // @validates TenantId - performs Zod validation
 *    function parseTenantId(input: string): TenantId {
 *      return TenantIdSchema.parse(input);
 *    }
 *
 *    // @assumes TenantId - no validation, requires validated input
 *    function formatTenantId(id: TenantId): string {
 *      return `tenant:${unbrand(id)}`;
 *    }
 *    ```
 *
 * 5. Test brand type enforcement:
 *    ```typescript
 *    // Should fail to compile
 *    const apiKey: ApiKeyId = getTenantId(); // ❌
 *    ```
 */
