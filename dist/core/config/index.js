"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isProduction = exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const required = (name) => {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing required environment variable ${name}. See the environment section of CLAUDE.md.`);
    }
    return value;
};
const optional = (name, fallback) => process.env[name]?.trim() || fallback;
/**
 * Validated configuration, read once at startup.
 *
 * Reading env vars through this object means a missing or malformed value
 * fails the process immediately with a clear message, instead of surfacing as
 * a confusing runtime error on the first request that happens to need it.
 */
exports.config = {
    env: optional("NODE_ENV", "development"),
    port: Number(optional("PORT", "3000")),
    mongoUri: required("MONGODB_URI"),
    clerkSecretKey: required("CLERK_SECRET_KEY"),
    /** Comma-separated list, so staging and local can share one deployment. */
    corsOrigins: optional("CORS_ORIGIN", "http://localhost:5173")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
    cloudinary: {
        cloudName: required("CLOUDINARY_CLOUD_NAME"),
        apiKey: required("CLOUDINARY_API_KEY"),
        apiSecret: required("CLOUDINARY_API_SECRET"),
    },
};
exports.isProduction = exports.config.env === "production";
if (!Number.isFinite(exports.config.port) || exports.config.port <= 0) {
    throw new Error(`PORT must be a positive number, received "${process.env.PORT}"`);
}
exports.default = exports.config;
//# sourceMappingURL=index.js.map