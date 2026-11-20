/**
 * Whether a Clerk user may use the MCP server: the allowlist names user ids
 * or verified email addresses (lower-cased). An empty list allows nobody.
 */
export const isAllowed = async (
  userId: string,
  allowed: readonly string[],
  lookupEmails: (userId: string) => Promise<string[]>,
): Promise<boolean> => {
  if (allowed.length === 0) return false;
  if (allowed.includes(userId.toLowerCase())) return true;
  if (!allowed.some((entry) => entry.includes("@"))) return false;
  const emails = await lookupEmails(userId);
  return emails.some((email) => allowed.includes(email.toLowerCase()));
};
