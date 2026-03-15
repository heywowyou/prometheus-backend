"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mediaLog_controller_1 = require("./mediaLog.controller");
const requireUser_1 = __importDefault(require("../../core/auth/requireUser"));
const router = (0, express_1.Router)();
router.use(requireUser_1.default);
router.route("/").get(mediaLog_controller_1.getMediaLogs).post(mediaLog_controller_1.createMediaLog);
router.route("/:id").put(mediaLog_controller_1.updateMediaLog).delete(mediaLog_controller_1.deleteMediaLog);
exports.default = router;
