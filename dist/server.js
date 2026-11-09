"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const express_2 = require("@clerk/express");
const config_1 = __importDefault(require("./core/config"));
const logger_1 = __importDefault(require("./core/logger"));
const db_1 = __importStar(require("./core/db"));
const http_1 = require("./core/http");
const todos_1 = require("./modules/todos");
const media_1 = require("./modules/media");
const images_1 = require("./modules/images");
const notes_1 = require("./modules/notes");
const createApp = () => {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)({ origin: config_1.default.corsOrigins, credentials: true }));
    // Note bodies are Tiptap HTML and outgrow the 100 KB default.
    app.use(express_1.default.json({ limit: "2mb" }));
    app.use(express_1.default.urlencoded({ extended: false, limit: "2mb" }));
    app.use((0, express_2.clerkMiddleware)());
    // Kept at both paths: /health for probes, / for anything still pinging the
    // root the way the pre-refactor server answered it.
    const health = (_req, res) => {
        res.status(200).json({ status: "ok" });
    };
    app.get("/", health);
    app.get("/health", health);
    app.use("/api/todos", todos_1.todoRoutes);
    app.use("/api/media", media_1.mediaLogRoutes);
    app.use("/api/images", images_1.imageRoutes);
    app.use("/api/notes", notes_1.noteRoutes);
    // Must come after every route: unmatched paths become a 404, and all thrown
    // or rejected handlers land in one place.
    app.use(http_1.notFoundHandler);
    app.use(http_1.errorHandler);
    return app;
};
exports.createApp = createApp;
const start = async () => {
    // Connect before listening so the first request can't hit a cold database.
    await (0, db_1.default)();
    const server = (0, exports.createApp)().listen(config_1.default.port, () => {
        logger_1.default.info(`Server listening on port ${config_1.default.port} (${config_1.default.env})`);
    });
    const shutdown = (signal) => {
        logger_1.default.info(`${signal} received, shutting down`);
        server.close(() => {
            void (0, db_1.disconnectDB)().finally(() => process.exit(0));
        });
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
};
// Guarded so the app can be imported by a test or script without listening.
if (require.main === module) {
    start().catch((error) => {
        logger_1.default.error("Failed to start server", error);
        process.exit(1);
    });
}
//# sourceMappingURL=server.js.map