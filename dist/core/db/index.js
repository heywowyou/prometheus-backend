"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.disconnectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../logger"));
/**
 * Opens the MongoDB connection. Rejects on failure so the caller can decide
 * whether to exit — the server must not start accepting requests before the
 * database is reachable.
 */
const connectDB = async () => {
    mongoose_1.default.connection.on("disconnected", () => {
        logger_1.default.warn("MongoDB disconnected");
    });
    mongoose_1.default.connection.on("error", (error) => {
        logger_1.default.error("MongoDB connection error", error);
    });
    const conn = await mongoose_1.default.connect(config_1.default.mongoUri);
    logger_1.default.info(`MongoDB connected: ${conn.connection.host}`);
};
const disconnectDB = async () => {
    await mongoose_1.default.connection.close();
};
exports.disconnectDB = disconnectDB;
exports.default = connectDB;
//# sourceMappingURL=index.js.map