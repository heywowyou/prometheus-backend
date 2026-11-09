"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mediaLog_controller_1 = require("./mediaLog.controller");
const auth_1 = require("../../core/auth");
const router = (0, express_1.Router)();
router.use(auth_1.requireUser);
router.route("/").get(mediaLog_controller_1.listMediaLogs).post(mediaLog_controller_1.createMediaLog);
router.patch("/:id/favorite", mediaLog_controller_1.toggleFavorite);
router.route("/:id").patch(mediaLog_controller_1.updateMediaLog).delete(mediaLog_controller_1.deleteMediaLog);
exports.default = router;
//# sourceMappingURL=mediaLog.routes.js.map