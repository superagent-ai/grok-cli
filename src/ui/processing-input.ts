const PROCESSING_STATUS_NUDGES = new Set([
  "continue",
  "status",
  "ping",
  "still running",
  "still working",
  "are you stuck",
  "are you frozen",
]);

function normalizeProcessingInput(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

export function isProcessingStatusNudge(value: string): boolean {
  return PROCESSING_STATUS_NUDGES.has(normalizeProcessingInput(value));
}
