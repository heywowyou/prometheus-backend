"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const clerk_sdk_node_1 = require("@clerk/clerk-sdk-node");
const requireUser = (0, clerk_sdk_node_1.ClerkExpressRequireAuth)({});
exports.default = requireUser;
