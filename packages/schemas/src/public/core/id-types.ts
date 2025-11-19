/**
 * ID Brand Types for @ax-cli/schemas
 *
 * This file contains all ID brand type factories using the createBrandFactory utility.
 * Each ID type is validated and branded to prevent mixing different ID types at compile time.
 *
 * SECURITY: All IDs MUST be validated at system boundaries using the provided factories.
 *
 * @module id-types
 */

import { z } from 'zod';
import { createBrandFactory, brand, type Brand } from './brand-types.js';

/**
 * API Response ID - Unique identifier for API responses
 *
 * @security MUST validate at API boundaries
 * @example
 * ```typescript
 * const result = ApiResponseId.schema.safeParse(userInput);
 * if (result.success) {
 *   const id = result.data; // Validated and branded
 * }
 * ```
 */
export const ApiResponseId = createBrandFactory(
  z.string().uuid(),
  'ApiResponseId'
);

export type ApiResponseId = Brand<string, 'ApiResponseId'>;

/**
 * Tool Call ID - Unique identifier for tool calls in API responses
 *
 * @security MUST validate at API boundaries
 */
export const ToolCallId = createBrandFactory(
  z.string().min(1),
  'ToolCallId'
);

export type ToolCallId = Brand<string, 'ToolCallId'>;

/**
 * ToolCallIdSchema - Zod schema for ToolCallId that can be used in z.object()
 * This transforms strings to branded ToolCallId types
 */
export const ToolCallIdSchema = z.string().min(1).transform((val) => brand<string, 'ToolCallId'>(val));

/**
 * Model ID - Identifier for AI models
 *
 * @security MUST validate at configuration boundaries
 * @example
 * ```typescript
 * const modelId = ModelId.parse('glm-4.6'); // Validates and brands
 * ```
 */
export const ModelId = createBrandFactory(
  z.string().min(1),
  'ModelId'
);

export type ModelId = Brand<string, 'ModelId'>;

/**
 * ModelIdSchema - Zod schema for ModelId that can be used in z.object()
 * This transforms strings to branded ModelId types
 */
export const ModelIdSchema = z.string().min(1).transform((val) => brand<string, 'ModelId'>(val));

/**
 * Tenant ID - Unique identifier for tenants (multi-tenancy support)
 *
 * @security MUST validate at authentication boundaries
 */
export const TenantId = createBrandFactory(
  z.string().uuid(),
  'TenantId'
);

export type TenantId = Brand<string, 'TenantId'>;

/**
 * API Key ID - Unique identifier for API keys
 *
 * @security MUST validate at authentication boundaries
 * @security NEVER log API key values - only IDs
 */
export const ApiKeyId = createBrandFactory(
  z.string().uuid(),
  'ApiKeyId'
);

export type ApiKeyId = Brand<string, 'ApiKeyId'>;

/**
 * MCP Server ID - Unique identifier for Model Context Protocol servers
 *
 * @security MUST validate at MCP configuration boundaries
 */
export const MCPServerId = createBrandFactory(
  z.string().min(1),
  'MCPServerId'
);

export type MCPServerId = Brand<string, 'MCPServerId'>;

/**
 * MCPServerIdSchema - Zod schema for MCPServerId that can be used in z.object()
 * This transforms strings to branded MCPServerId types
 */
export const MCPServerIdSchema = z.string().min(1).transform((val) => brand<string, 'MCPServerId'>(val));

/**
 * Usage Record ID - Unique identifier for usage tracking records
 *
 * @security MUST validate at billing/usage boundaries
 */
export const UsageRecordId = createBrandFactory(
  z.string().uuid(),
  'UsageRecordId'
);

export type UsageRecordId = Brand<string, 'UsageRecordId'>;

/**
 * Plan ID - Unique identifier for subscription/usage plans
 *
 * @security MUST validate at billing boundaries
 */
export const PlanId = createBrandFactory(
  z.string().min(1),
  'PlanId'
);

export type PlanId = Brand<string, 'PlanId'>;

/**
 * Session ID - Unique identifier for user sessions
 *
 * @security MUST validate at session management boundaries
 * @security CRITICAL: Session IDs should be cryptographically random
 */
export const SessionId = createBrandFactory(
  z.string().uuid(),
  'SessionId'
);

export type SessionId = Brand<string, 'SessionId'>;

/**
 * Request ID - Unique identifier for tracking requests
 *
 * Used for distributed tracing and logging correlation
 */
export const RequestId = createBrandFactory(
  z.string().uuid(),
  'RequestId'
);

export type RequestId = Brand<string, 'RequestId'>;

/**
 * COMPILE-TIME SAFETY EXAMPLES
 *
 * The following examples demonstrate how brand types prevent ID mixing:
 *
 * ```typescript
 * function updateUsage(tenantId: TenantId, apiKeyId: ApiKeyId) {
 *   // Implementation
 * }
 *
 * const tenant = TenantId.parse('550e8400-e29b-41d4-a716-446655440000');
 * const apiKey = ApiKeyId.parse('660f9511-f3ac-52e5-b827-557766551111');
 *
 * updateUsage(tenant, apiKey);        // ✅ Correct
 * updateUsage(apiKey, tenant);        // ❌ Compile error!
 * updateUsage('raw-string', apiKey);  // ❌ Compile error!
 * ```
 *
 * VALIDATION AT BOUNDARIES
 *
 * ```typescript
 * // API endpoint
 * app.post('/api/usage', (req, res) => {
 *   const tenantResult = TenantId.schema.safeParse(req.body.tenantId);
 *   const apiKeyResult = ApiKeyId.schema.safeParse(req.headers['x-api-key-id']);
 *
 *   if (!tenantResult.success || !apiKeyResult.success) {
 *     return res.status(400).json({ error: 'Invalid IDs' });
 *   }
 *
 *   // Now safe to use - validated AND branded
 *   updateUsage(tenantResult.data, apiKeyResult.data);
 * });
 * ```
 */
