/**
 * @ax-cli/schemas - Single Source of Truth Type System
 *
 * This package provides centralized Zod schemas, brand types, and enums
 * for the entire ax-cli ecosystem.
 *
 * SECURITY: All exports are controlled. Internal helpers are not exposed.
 *
 * @packageDocumentation
 */

// Core brand type utilities
export {
  brand,
  unbrand,
  isBranded,
  createBrandFactory,
  type Brand,
  type ExtractBrand,
  type ExtractBase,
} from './public/core/brand-types.js';

// ID Brand Types
export {
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
} from './public/core/id-types.js';

// Centralized Enums
export {
  MessageRoleEnum,
  FinishReasonEnum,
  TransportEnum,
  EditorCommandEnum,
  type MessageRole,
  type FinishReason,
  type Transport,
  type EditorCommand,
} from './public/core/enums.js';

// Additional exports will be added as we implement them:
// - Domain schemas (Usage, API, MCP)
