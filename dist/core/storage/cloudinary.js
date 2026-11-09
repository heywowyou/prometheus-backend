"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadImage = uploadImage;
exports.deleteImage = deleteImage;
exports.deleteImageQuietly = deleteImageQuietly;
const cloudinary_1 = require("cloudinary");
const config_1 = __importDefault(require("../config"));
const logger_1 = __importDefault(require("../logger"));
// Configured once at import time; `core/config` has already loaded dotenv.
cloudinary_1.v2.config({
    cloud_name: config_1.default.cloudinary.cloudName,
    api_key: config_1.default.cloudinary.apiKey,
    api_secret: config_1.default.cloudinary.apiSecret,
});
async function uploadImage(buffer, options = {}) {
    return new Promise((resolve, reject) => {
        cloudinary_1.v2.uploader
            .upload_stream({
            folder: options.folder,
            resource_type: "image",
            fetch_format: "auto",
            quality: "auto",
            width: 800,
            crop: "limit",
        }, (error, result) => {
            if (error || !result) {
                reject(error ?? new Error("Cloudinary upload failed"));
                return;
            }
            resolve({ url: result.secure_url, publicId: result.public_id });
        })
            .end(buffer);
    });
}
async function deleteImage(publicId) {
    await cloudinary_1.v2.uploader.destroy(publicId);
}
/**
 * Best-effort cleanup for images whose owning document is going away.
 *
 * Deliberately swallows failures: an orphaned Cloudinary asset is a smaller
 * problem than a delete request that fails after the document is already gone.
 */
async function deleteImageQuietly(publicId) {
    if (!publicId)
        return;
    try {
        await deleteImage(publicId);
    }
    catch (error) {
        logger_1.default.warn(`Failed to delete Cloudinary asset ${publicId}`, error);
    }
}
//# sourceMappingURL=cloudinary.js.map