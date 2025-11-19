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

// Additional exports will be added as we implement them:
// - Enums (MessageRoleEnum, FinishReasonEnum, etc.)
// - Domain schemas (Usage, API, MCP)
// - Brand type factories (TenantId, ApiKeyId, etc.)
