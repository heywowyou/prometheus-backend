"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = __importDefault(require("./core/db"));
const todos_1 = require("./modules/todos");
dotenv_1.default.config();
(0, db_1.default)();
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: false }));
const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.get("/", (_req, res) => {
    res.send("API is running");
});
app.use("/api/todos", todos_1.todoRoutes);
app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Server started on port ${PORT}`);
});
