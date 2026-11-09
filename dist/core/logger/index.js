"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const LEVEL_ORDER = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
const minLevel = process.env.LOG_LEVEL ??
    (process.env.NODE_ENV === "production" ? "info" : "debug");
const enabled = (level) => LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
const emit = (level, message, meta) => {
    if (!enabled(level))
        return;
    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${message}`;
    const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
    if (meta === undefined)
        sink(line);
    else
        sink(line, meta);
};
exports.logger = {
    debug: (message, meta) => emit("debug", message, meta),
    info: (message, meta) => emit("info", message, meta),
    warn: (message, meta) => emit("warn", message, meta),
    error: (message, meta) => emit("error", message, meta),
};
exports.default = exports.logger;
//# sourceMappingURL=index.js.map