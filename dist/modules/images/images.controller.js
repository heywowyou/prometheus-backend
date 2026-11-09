"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteImageHandler = exports.uploadFromUrlHandler = exports.uploadImageHandler = void 0;
const http_1 = require("../../core/http");
const AppError_1 = require("../../core/errors/AppError");
const storage_1 = require("../../core/storage");
const MEDIA_FOLDER = "prometheus/media";
exports.uploadImageHandler = (0, http_1.asyncHandler)(async (req, res) => {
    if (!req.file)
        throw new AppError_1.BadRequestError("No file provided");
    const result = await (0, storage_1.uploadImage)(req.file.buffer, { folder: MEDIA_FOLDER });
    res.status(201).json(result);
});
exports.uploadFromUrlHandler = (0, http_1.asyncHandler)(async (req, res) => {
    const b = (req.body ?? {});
    const url = (0, http_1.asRequiredString)(b.url, "url", { maxLength: 2000 });
    // `fetchRemoteImage` validates the URL, blocks non-public addresses, and
    // caps the download size before anything reaches Cloudinary.
    const buffer = await (0, storage_1.fetchRemoteImage)(url);
    const result = await (0, storage_1.uploadImage)(buffer, { folder: MEDIA_FOLDER });
    res.status(201).json(result);
});
exports.deleteImageHandler = (0, http_1.asyncHandler)(async (req, res) => {
    const publicId = (0, http_1.asRequiredString)(req.query.publicId, "publicId");
    // Scoped to the app's own folder so a crafted id can't reach another
    // project's assets in the same Cloudinary account.
    if (!publicId.startsWith(`${MEDIA_FOLDER}/`)) {
        throw new AppError_1.BadRequestError("publicId is outside the media folder");
    }
    await (0, storage_1.deleteImage)(publicId);
    res.status(204).send();
});
//# sourceMappingURL=images.controller.js.map