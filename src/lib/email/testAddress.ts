/**
 * Detects Resend test addresses (REDACTED_ACCOUNT_EMAIL, REDACTED_ACCOUNT_EMAIL, etc.)
 * These are used for E2E testing and should be excluded from real bounce metrics.
 */
export const isTestAddress = (email: string): boolean =>
  /^(bounced|complained|delivered)(\+[^@]*)?@resend\.dev$/i.test(email.trim());
