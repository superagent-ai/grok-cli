/**
 * Backward-compatible re-exports for the xAI model catalog.
 * The catalog itself lives at "../providers/xai-models". Prefer importing
 * from there in new code.
 */
export {
  DEFAULT_XAI_MODEL as DEFAULT_MODEL,
  getXaiEffectiveReasoningEffort as getEffectiveReasoningEffort,
  getXaiModelIds as getModelIds,
  getXaiModelInfo as getModelInfo,
  getXaiSupportedReasoningEfforts as getSupportedReasoningEfforts,
  isKnownXaiModelId as isKnownModelId,
  normalizeXaiModelId as normalizeModelId,
  XAI_MODELS as MODELS,
} from "../providers/xai-models";
