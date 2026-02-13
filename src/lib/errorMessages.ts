/**
 * Maps technical errors to user-friendly messages.
 * The tone subtly communicates the issue is temporary or external.
 */
export function getFriendlyErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Network errors
  if (
    lower.includes('failed to fetch') ||
    lower.includes('networkerror') ||
    lower.includes('network')
  ) {
    return 'Unable to reach our servers. Please check your internet connection and try again.';
  }

  // Timeout errors
  if (
    lower.includes('timeout') ||
    lower.includes('504') ||
    lower.includes('timed out') ||
    lower.includes('deadline')
  ) {
    return 'The operation took longer than expected. This can happen with very large datasets. Please try again — processing times may vary depending on server load.';
  }

  // Rate limiting
  if (
    lower.includes('429') ||
    lower.includes('rate limit') ||
    lower.includes('too many')
  ) {
    return 'Our servers are experiencing high demand right now. Please wait a moment and try again.';
  }

  // Server errors (500, 502, 503)
  if (
    lower.includes('500') ||
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('internal server')
  ) {
    return 'Our servers encountered a temporary issue. This is usually resolved quickly — please try again in a few moments.';
  }

  // Payload too large
  if (
    lower.includes('413') ||
    lower.includes('payload') ||
    lower.includes('too large') ||
    lower.includes('entity too large')
  ) {
    return 'The dataset exceeds the current size limit. Try reducing the number of records or contact support for enterprise volumes.';
  }

  // Auth errors
  if (
    lower.includes('401') ||
    lower.includes('unauthorized') ||
    lower.includes('not authenticated')
  ) {
    return 'Your session may have expired. Please refresh the page and sign in again.';
  }

  // Forbidden
  if (lower.includes('403') || lower.includes('forbidden')) {
    return "You don't have permission to perform this action. Please contact your organization admin.";
  }

  // Supabase storage errors
  if (
    lower.includes('storage') ||
    lower.includes('upload') ||
    lower.includes('bucket')
  ) {
    return 'There was an issue uploading your files. Please try again — this is usually a temporary issue.';
  }

  // AI-specific errors (Anthropic)
  if (
    lower.includes('anthropic') ||
    lower.includes('claude') ||
    lower.includes('ai') ||
    lower.includes('overloaded')
  ) {
    return 'Our AI service is temporarily unavailable. The reconciliation will still work — only AI-powered features (Copilot, AI Analysis, Smart Rules) are affected. Please try again shortly.';
  }

  // Generic fallback
  if (msg.length > 200) {
    return 'An unexpected error occurred. Please try again. If the issue persists, contact support.';
  }

  // If the error message is already somewhat user-friendly (short and readable), use it
  return msg;
}
