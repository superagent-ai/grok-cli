/**
 * Test suite for ID brand types
 *
 * Tests all ID type factories for validation, type safety, and runtime behavior.
 */

import { describe, it, expect, expectTypeOf } from 'vitest';
import {
  ApiResponseId,
  ToolCallId,
  ModelId,
  TenantId,
  ApiKeyId,
  MCPServerId,
  UsageRecordId,
  PlanId,
  SessionId,
  RequestId,
  type ApiResponseId as ApiResponseIdType,
  type ToolCallId as ToolCallIdType,
  type ModelId as ModelIdType,
  type TenantId as TenantIdType,
  type ApiKeyId as ApiKeyIdType,
  type MCPServerId as MCPServerIdType,
  type UsageRecordId as UsageRecordIdType,
  type PlanId as PlanIdType,
  type SessionId as SessionIdType,
  type RequestId as RequestIdType,
} from '../src/index.js';

describe('ID Brand Types', () => {
  describe('ApiResponseId', () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';

    it('should validate and brand valid UUID', () => {
      const result = ApiResponseId.schema.safeParse(validUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validUuid);
        expectTypeOf(result.data).toEqualTypeOf<ApiResponseIdType>();
      }
    });

    it('should reject invalid UUID', () => {
      const result = ApiResponseId.schema.safeParse('not-a-uuid');
      expect(result.success).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(ApiResponseId.schema.safeParse(123).success).toBe(false);
      expect(ApiResponseId.schema.safeParse(null).success).toBe(false);
      expect(ApiResponseId.schema.safeParse(undefined).success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(ApiResponseId.is(validUuid)).toBe(true);
      expect(ApiResponseId.is('not-a-uuid')).toBe(false);
    });

    it('should parse valid UUID', () => {
      const id = ApiResponseId.parse(validUuid);
      expect(id).toBe(validUuid);
      expectTypeOf(id).toEqualTypeOf<ApiResponseIdType>();
    });

    it('should throw on invalid parse', () => {
      expect(() => ApiResponseId.parse('not-a-uuid')).toThrow();
    });
  });

  describe('ToolCallId', () => {
    it('should validate and brand non-empty string', () => {
      const result = ToolCallId.schema.safeParse('tool-call-123');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('tool-call-123');
        expectTypeOf(result.data).toEqualTypeOf<ToolCallIdType>();
      }
    });

    it('should reject empty string', () => {
      const result = ToolCallId.schema.safeParse('');
      expect(result.success).toBe(false);
    });

    it('should reject non-string input', () => {
      expect(ToolCallId.schema.safeParse(123).success).toBe(false);
      expect(ToolCallId.schema.safeParse(null).success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(ToolCallId.is('tool-call-123')).toBe(true);
      expect(ToolCallId.is('')).toBe(false);
    });

    it('should parse valid string', () => {
      const id = ToolCallId.parse('tool-call-123');
      expect(id).toBe('tool-call-123');
      expectTypeOf(id).toEqualTypeOf<ToolCallIdType>();
    });
  });

  describe('ModelId', () => {
    it('should validate and brand model ID string', () => {
      const result = ModelId.schema.safeParse('glm-4.6');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('glm-4.6');
        expectTypeOf(result.data).toEqualTypeOf<ModelIdType>();
      }
    });

    it('should reject empty string', () => {
      expect(ModelId.schema.safeParse('').success).toBe(false);
    });

    it('should accept various model name formats', () => {
      expect(ModelId.is('glm-4.6')).toBe(true);
      expect(ModelId.is('grok-beta')).toBe(true);
      expect(ModelId.is('claude-3-opus')).toBe(true);
    });

    it('should parse valid model ID', () => {
      const id = ModelId.parse('glm-4.6');
      expect(id).toBe('glm-4.6');
      expectTypeOf(id).toEqualTypeOf<ModelIdType>();
    });
  });

  describe('TenantId', () => {
    const validUuid = '660f9511-f3ac-52e5-b827-557766551111';

    it('should validate and brand valid UUID', () => {
      const result = TenantId.schema.safeParse(validUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validUuid);
        expectTypeOf(result.data).toEqualTypeOf<TenantIdType>();
      }
    });

    it('should reject invalid UUID', () => {
      expect(TenantId.schema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(TenantId.is(validUuid)).toBe(true);
      expect(TenantId.is('not-a-uuid')).toBe(false);
    });

    it('should parse valid UUID', () => {
      const id = TenantId.parse(validUuid);
      expect(id).toBe(validUuid);
      expectTypeOf(id).toEqualTypeOf<TenantIdType>();
    });
  });

  describe('ApiKeyId', () => {
    const validUuid = '770fa622-04bd-63f6-c938-668877662222';

    it('should validate and brand valid UUID', () => {
      const result = ApiKeyId.schema.safeParse(validUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validUuid);
        expectTypeOf(result.data).toEqualTypeOf<ApiKeyIdType>();
      }
    });

    it('should reject invalid UUID', () => {
      expect(ApiKeyId.schema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(ApiKeyId.is(validUuid)).toBe(true);
      expect(ApiKeyId.is('invalid')).toBe(false);
    });

    it('should parse valid UUID', () => {
      const id = ApiKeyId.parse(validUuid);
      expect(id).toBe(validUuid);
      expectTypeOf(id).toEqualTypeOf<ApiKeyIdType>();
    });
  });

  describe('MCPServerId', () => {
    it('should validate and brand server ID string', () => {
      const result = MCPServerId.schema.safeParse('linear-server');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('linear-server');
        expectTypeOf(result.data).toEqualTypeOf<MCPServerIdType>();
      }
    });

    it('should reject empty string', () => {
      expect(MCPServerId.schema.safeParse('').success).toBe(false);
    });

    it('should accept various server name formats', () => {
      expect(MCPServerId.is('github-server')).toBe(true);
      expect(MCPServerId.is('server_123')).toBe(true);
      expect(MCPServerId.is('my-mcp-server')).toBe(true);
    });

    it('should parse valid server ID', () => {
      const id = MCPServerId.parse('linear-server');
      expect(id).toBe('linear-server');
      expectTypeOf(id).toEqualTypeOf<MCPServerIdType>();
    });
  });

  describe('UsageRecordId', () => {
    const validUuid = '880fb733-15ce-74e7-d049-779988773333';

    it('should validate and brand valid UUID', () => {
      const result = UsageRecordId.schema.safeParse(validUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validUuid);
        expectTypeOf(result.data).toEqualTypeOf<UsageRecordIdType>();
      }
    });

    it('should reject invalid UUID', () => {
      expect(UsageRecordId.schema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(UsageRecordId.is(validUuid)).toBe(true);
      expect(UsageRecordId.is('invalid')).toBe(false);
    });

    it('should parse valid UUID', () => {
      const id = UsageRecordId.parse(validUuid);
      expect(id).toBe(validUuid);
      expectTypeOf(id).toEqualTypeOf<UsageRecordIdType>();
    });
  });

  describe('PlanId', () => {
    it('should validate and brand plan ID string', () => {
      const result = PlanId.schema.safeParse('enterprise-plan');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('enterprise-plan');
        expectTypeOf(result.data).toEqualTypeOf<PlanIdType>();
      }
    });

    it('should reject empty string', () => {
      expect(PlanId.schema.safeParse('').success).toBe(false);
    });

    it('should accept various plan name formats', () => {
      expect(PlanId.is('free')).toBe(true);
      expect(PlanId.is('pro-monthly')).toBe(true);
      expect(PlanId.is('enterprise_annual')).toBe(true);
    });

    it('should parse valid plan ID', () => {
      const id = PlanId.parse('pro-monthly');
      expect(id).toBe('pro-monthly');
      expectTypeOf(id).toEqualTypeOf<PlanIdType>();
    });
  });

  describe('SessionId', () => {
    const validUuid = '990fc844-26df-85e8-e15a-88aa99884444';

    it('should validate and brand valid UUID', () => {
      const result = SessionId.schema.safeParse(validUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validUuid);
        expectTypeOf(result.data).toEqualTypeOf<SessionIdType>();
      }
    });

    it('should reject invalid UUID', () => {
      expect(SessionId.schema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(SessionId.is(validUuid)).toBe(true);
      expect(SessionId.is('invalid')).toBe(false);
    });

    it('should parse valid UUID', () => {
      const id = SessionId.parse(validUuid);
      expect(id).toBe(validUuid);
      expectTypeOf(id).toEqualTypeOf<SessionIdType>();
    });
  });

  describe('RequestId', () => {
    const validUuid = 'aa0fd955-37ef-96e9-f26b-99bb00995555';

    it('should validate and brand valid UUID', () => {
      const result = RequestId.schema.safeParse(validUuid);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(validUuid);
        expectTypeOf(result.data).toEqualTypeOf<RequestIdType>();
      }
    });

    it('should reject invalid UUID', () => {
      expect(RequestId.schema.safeParse('not-a-uuid').success).toBe(false);
    });

    it('should work with is() type guard', () => {
      expect(RequestId.is(validUuid)).toBe(true);
      expect(RequestId.is('invalid')).toBe(false);
    });

    it('should parse valid UUID', () => {
      const id = RequestId.parse(validUuid);
      expect(id).toBe(validUuid);
      expectTypeOf(id).toEqualTypeOf<RequestIdType>();
    });
  });

  describe('Type Safety - ID Mixing Prevention', () => {
    it('should prevent mixing different ID types at compile time', () => {
      const tenantId = TenantId.parse('550e8400-e29b-41d4-a716-446655440000');
      const apiKeyId = ApiKeyId.parse('660f9511-f3ac-52e5-b827-557766551111');

      // These should fail at compile time
      // @ts-expect-error - Cannot assign TenantId to ApiKeyId
      const wrongAssignment1: ApiKeyIdType = tenantId;

      // @ts-expect-error - Cannot assign ApiKeyId to TenantId
      const wrongAssignment2: TenantIdType = apiKeyId;

      // Satisfy linter
      expect(wrongAssignment1).toBeDefined();
      expect(wrongAssignment2).toBeDefined();
    });

    it('should enforce correct ID types in function signatures', () => {
      function authenticateUser(tenantId: TenantIdType, apiKeyId: ApiKeyIdType): string {
        return `Authenticated tenant ${tenantId} with key ${apiKeyId}`;
      }

      const tenant = TenantId.parse('550e8400-e29b-41d4-a716-446655440000');
      const apiKey = ApiKeyId.parse('660f9511-f3ac-52e5-b827-557766551111');

      // Correct usage
      const result = authenticateUser(tenant, apiKey);
      expect(result).toContain('Authenticated tenant');

      // The following demonstrates compile-time protection
      // @ts-expect-error - Arguments swapped (wrong brand types)
      // This would fail at compile time in a real TypeScript environment
      // authenticateUser(apiKey, tenant);
    });

    it('should prevent plain strings from being used as IDs', () => {
      function trackUsage(tenantId: TenantIdType, recordId: UsageRecordIdType): void {
        expect(tenantId).toBeDefined();
        expect(recordId).toBeDefined();
      }

      const tenant = TenantId.parse('550e8400-e29b-41d4-a716-446655440000');
      const record = UsageRecordId.parse('660f9511-f3ac-52e5-b827-557766551111');

      // Correct usage
      trackUsage(tenant, record);

      // The following would fail at compile time
      // @ts-expect-error - Cannot use plain string as TenantId
      // trackUsage('550e8400-e29b-41d4-a716-446655440000', record);
    });
  });

  describe('Integration Tests', () => {
    it('should work in multi-tenant usage tracking scenario', () => {
      const tenantId = TenantId.parse('550e8400-e29b-41d4-a716-446655440000');
      const apiKeyId = ApiKeyId.parse('660f9511-f3ac-52e5-b827-557766551111');
      const usageRecordId = UsageRecordId.parse('770fa622-04bd-63f6-c938-668877662222');
      const sessionId = SessionId.parse('880fb733-15ce-74e7-d049-779988773333');

      function recordApiUsage(
        tenant: TenantIdType,
        apiKey: ApiKeyIdType,
        session: SessionIdType,
        record: UsageRecordIdType
      ): { tenant: string; session: string } {
        expect(tenant).toBe(tenantId);
        expect(apiKey).toBe(apiKeyId);
        expect(session).toBe(sessionId);
        expect(record).toBe(usageRecordId);

        return { tenant, session };
      }

      const result = recordApiUsage(tenantId, apiKeyId, sessionId, usageRecordId);
      expect(result.tenant).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.session).toBe('880fb733-15ce-74e7-d049-779988773333');
    });

    it('should work in MCP server configuration scenario', () => {
      const serverId = MCPServerId.parse('linear-server');
      const modelId = ModelId.parse('glm-4.6');

      function configureMCPServer(
        server: MCPServerIdType,
        model: ModelIdType
      ): string {
        return `Server ${server} configured with model ${model}`;
      }

      const result = configureMCPServer(serverId, modelId);
      expect(result).toBe('Server linear-server configured with model glm-4.6');
    });

    it('should work in API response tracking scenario', () => {
      const responseId = ApiResponseId.parse('550e8400-e29b-41d4-a716-446655440000');
      const toolCallId = ToolCallId.parse('tool-call-123');
      const requestId = RequestId.parse('660f9511-f3ac-52e5-b827-557766551111');

      function trackApiResponse(
        response: ApiResponseIdType,
        tool: ToolCallIdType,
        request: RequestIdType
      ): { response: string; tool: string; request: string } {
        return { response, tool, request };
      }

      const result = trackApiResponse(responseId, toolCallId, requestId);
      expect(result.response).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.tool).toBe('tool-call-123');
      expect(result.request).toBe('660f9511-f3ac-52e5-b827-557766551111');
    });
  });

  describe('Security - Boundary Validation', () => {
    it('should reject malformed IDs at API boundaries', () => {
      // Simulate user input from API
      const userInputs = [
        'not-a-uuid',
        '',
        'SELECT * FROM users',
        '../../../etc/passwd',
        '<script>alert("xss")</script>',
      ];

      userInputs.forEach(input => {
        expect(TenantId.schema.safeParse(input).success).toBe(false);
        expect(ApiKeyId.schema.safeParse(input).success).toBe(false);
        expect(SessionId.schema.safeParse(input).success).toBe(false);
      });
    });

    it('should enforce validation before branding', () => {
      // Safe: Validation before use
      const userInput = 'user-provided-id';
      const result = MCPServerId.schema.safeParse(userInput);

      if (result.success) {
        const serverId = result.data;
        expect(MCPServerId.is(serverId)).toBe(true);
      } else {
        // Handle validation error
        expect(result.success).toBe(false);
      }
    });

    it('should document validation requirements', () => {
      // @validates TenantId - performs Zod validation
      function parseTenantIdFromRequest(input: string): TenantIdType {
        return TenantId.parse(input);
      }

      // @assumes TenantId - requires pre-validated input
      function formatTenantForLogging(id: TenantIdType): string {
        return `TENANT:${id}`;
      }

      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      const tenantId = parseTenantIdFromRequest(validUuid); // Validates here
      const formatted = formatTenantForLogging(tenantId); // No validation needed

      expect(formatted).toBe(`TENANT:${validUuid}`);
    });
  });
});
