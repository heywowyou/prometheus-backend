import { Router, type RequestHandler } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import config from "../../core/config";
import logger from "../../core/logger";
import { clerkFrontendApiUrl, protectedResourceMetadata, requireMcpUser } from "./mcp.auth";
import { createMcpServer } from "./mcp.server";

/**
 * Mounted at the root, before the app's Clerk session middleware: the MCP
 * endpoint authenticates OAuth access tokens itself, and the discovery
 * documents are public.
 */
const router = Router();

// Claude calls from its own servers, so CORS only matters for browser-based
// MCP clients (e.g. the MCP Inspector). The bearer token is the credential;
// no cookies are involved.
const openCors = cors({
  origin: "*",
  exposedHeaders: ["WWW-Authenticate", "Mcp-Session-Id", "Mcp-Protocol-Version"],
});
router.use(["/mcp", "/.well-known"], openCors);

const resourcePath = new URL(config.mcp.resourceUrl).pathname;

const sendResourceMetadata: RequestHandler = (_req, res) => {
  res.set("Cache-Control", "public, max-age=3600").json(protectedResourceMetadata());
};
router.get("/.well-known/oauth-protected-resource", sendResourceMetadata);
router.get(`/.well-known/oauth-protected-resource${resourcePath}`, sendResourceMetadata);

/**
 * Clients built for the older MCP auth spec look for the authorization
 * server's metadata at the resource's origin; this relays Clerk's.
 */
let authServerMetadata: { body: unknown; at: number } | null = null;
const sendAuthServerMetadata: RequestHandler = async (_req, res, next) => {
  try {
    const authServer = clerkFrontendApiUrl();
    if (!authServer) {
      res.status(503).json({ error: "OAuth is not configured (CLERK_PUBLISHABLE_KEY is missing)" });
      return;
    }
    if (!authServerMetadata || Date.now() - authServerMetadata.at > 60 * 60_000) {
      const response = await fetch(`${authServer}/.well-known/oauth-authorization-server`);
      if (!response.ok) throw new Error(`Clerk metadata answered ${response.status}`);
      authServerMetadata = { body: await response.json(), at: Date.now() };
    }
    res.set("Cache-Control", "public, max-age=3600").json(authServerMetadata.body);
  } catch (error) {
    next(error);
  }
};
router.get("/.well-known/oauth-authorization-server", sendAuthServerMetadata);
router.get(`/.well-known/oauth-authorization-server${resourcePath}`, sendAuthServerMetadata);

/** Stateless Streamable HTTP: one server and transport per request. */
router.post(resourcePath, requireMcpUser, async (req, res) => {
  const server = createMcpServer({ userId: req.mcpUserId as string, timeZone: config.mcp.timeZone });
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    logger.error("MCP request failed", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

// No server-initiated streams or sessions in stateless mode.
const methodNotAllowed: RequestHandler = (_req, res) => {
  res
    .status(405)
    .set("Allow", "POST")
    .json({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed" }, id: null });
};
router.get(resourcePath, methodNotAllowed);
router.delete(resourcePath, methodNotAllowed);

export default router;
