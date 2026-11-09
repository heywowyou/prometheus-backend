"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadSingle = void 0;
const multer_1 = __importDefault(require("multer"));
const AppError_1 = require("../errors/AppError");
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter(_req, file, cb) {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
            cb(null, true);
            return;
        }
        // An AppError so the error middleware answers 400 rather than 500.
        cb(new AppError_1.BadRequestError("Only JPEG, PNG, and WebP images are allowed"));
    },
});
exports.uploadSingle = upload.single("file");
//# sourceMappingURL=upload.middleware.js.map