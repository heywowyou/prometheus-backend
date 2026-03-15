"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            console.error("MONGODB_URI is not set in this environment");
            throw new Error("MONGODB_URI environment variable is not set");
        }
        const conn = await mongoose_1.default.connect(mongoUri);
        // eslint-disable-next-line no-console
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    }
    catch (error) {
        const err = error;
        // eslint-disable-next-line no-console
        console.error(`Error: ${err.message}`);
        process.exit(1);
    }
};
exports.default = connectDB;
