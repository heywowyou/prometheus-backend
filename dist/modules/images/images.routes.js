"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../core/auth");
const storage_1 = require("../../core/storage");
const images_controller_1 = require("./images.controller");
const router = (0, express_1.Router)();
router.use(auth_1.requireUser);
router.post("/upload", storage_1.uploadSingle, images_controller_1.uploadImageHandler);
router.post("/upload-from-url", images_controller_1.uploadFromUrlHandler);
router.delete("/", images_controller_1.deleteImageHandler);
exports.default = router;
//# sourceMappingURL=images.routes.js.map