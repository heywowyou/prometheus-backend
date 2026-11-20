import type { Request, RequestHandler } from "express";
import { authenticateRequest, clerkClient } from "@clerk/express";
import config from "../../core/config";
import logger from "../../core/logger";
import { isAllowed } from "./allowlist";

/**
 * OAuth for the MCP endpoint.
 *
 * Clerk is the authorization server: Claude discovers it from the protected
 * resource metadata below, registers itself, signs Jules in with Clerk and
 * sends the access token it gets on every MCP request. The API only checks
 * the token (signature, expiry, audience) and that its user is on the
 * allowlist, since the MCP tools can read and delete everything.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by `requireMcpUser`: the Clerk user an MCP request acts for. */
      mcpUserId?: string;
    }
  }
}

/** The Clerk Frontend API (the OAuth server), decoded from the publishable key. */
export const clerkFrontendApiUrl = (): string | null => {
  const key = config.mcp.clerkPublishableKey.replace(/^pk_(test|live)_/, "");
  if (!key) return null;
  const host = Buffer.from(key, "base64").toString("utf8").replace(/\$$/, "").trim();
  return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
};

/** RFC 9728: the metadata lives under the resource's path, at the resource's origin. */
export const resourceMetadataUrl = (): string => {
  const url = new URL(config.mcp.resourceUrl);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.origin}/.well-known/oauth-protected-resource${path}`;
};

export const protectedResourceMetadata = () => {
  const authServer = clerkFrontendApiUrl();
  return {
    resource: config.mcp.resourceUrl,
    authorization_servers: authServer ? [authServer] : [],
    scopes_supported: ["profile", "email"],
    bearer_methods_supported: ["header"],
    resource_name: "Prometheus",
  };
};

const challenge = (res: Parameters<RequestHandler>[1], error?: string) => {
  const parts = [`resource_metadata="${resourceMetadataUrl()}"`];
  if (error) parts.push(`error="${error}"`);
  res
    .status(401)
    .set("WWW-Authenticate", `Bearer ${parts.join(", ")}`)
    .json({ error: error ?? "unauthorized", error_description: "Sign in to Prometheus to use this server" });
};

/** Emails per Clerk user, so the allowlist can name an address without a lookup per request. */
const emailCache = new Map<string, { emails: string[]; at: number }>();
const EMAIL_CACHE_MS = 10 * 60_000;

const emailsOf = async (userId: string): Promise<string[]> => {
  const cached = emailCache.get(userId);
  if (cached && Date.now() - cached.at < EMAIL_CACHE_MS) return cached.emails;
  const user = await clerkClient.users.getUser(userId);
  const emails = user.emailAddresses
    .filter((address) => address.verification?.status === "verified")
    .map((address) => address.emailAddress.toLowerCase());
  emailCache.set(userId, { emails, at: Date.now() });
  return emails;
};

const bearerToken = (req: Request): string | null => {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
};

/**
 * Lets an MCP request through only with a valid Clerk OAuth access token,
 * issued for this server, of an allowed user.
 */
export const requireMcpUser: RequestHandler = async (req, res, next) => {
  try {
    if (!bearerToken(req)) {
      challenge(res);
      return;
    }

    const state = await authenticateRequest({
      clerkClient,
      request: req,
      options: { acceptsToken: "oauth_token", audience: config.mcp.resourceUrl },
    });
    const auth = state.isAuthenticated ? (state.toAuth() as { userId?: string | null }) : null;
    const userId = auth?.userId ?? null;
    if (!userId) {
      logger.warn(`MCP token rejected: ${state.reason ?? "unknown"} ${state.message ?? ""}`.trim());
      challenge(res, "invalid_token");
      return;
    }

    if (!(await isAllowed(userId, config.mcp.allowedUsers, emailsOf))) {
      logger.warn(`MCP access refused for Clerk user ${userId}`);
      res.status(403).json({
        error: "access_denied",
        error_description:
          config.mcp.allowedUsers.length === 0
            ? "The MCP server has no allowed users yet: set MCP_ALLOWED_USERS on the API."
            : `This account (${userId}) is not allowed to use the Prometheus MCP server.`,
      });
      return;
    }

    req.mcpUserId = userId;
    next();
  } catch (error) {
    next(error);
  }
};
