import { Router } from "express";
import { getUserId, requireUser } from "../../core/auth";
import { asRequiredString, asString, asyncHandler } from "../../core/http";
import { BadRequestError } from "../../core/errors/AppError";
import * as PushService from "./push.service";

const router = Router();
router.use(requireUser);

router.get(
  "/key",
  asyncHandler(async (_req, res) => {
    res.status(200).json({ publicKey: PushService.getPublicKey() });
  }),
);

router.post(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const keys = (b.keys ?? {}) as Record<string, unknown>;
    const endpoint = asRequiredString(b.endpoint, "endpoint", { maxLength: 2000 });
    if (!/^https:\/\//.test(endpoint)) throw new BadRequestError("endpoint must be an https URL");
    await PushService.subscribe(getUserId(req), {
      endpoint,
      keys: {
        p256dh: asRequiredString(keys.p256dh, "keys.p256dh", { maxLength: 200 }),
        auth: asRequiredString(keys.auth, "keys.auth", { maxLength: 100 }),
      },
      userAgent: (asString(req.get("user-agent"), "userAgent", { maxLength: 400 }) ?? "").slice(0, 400),
    });
    res.status(204).send();
  }),
);

router.delete(
  "/subscriptions",
  asyncHandler(async (req, res) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    await PushService.unsubscribe(getUserId(req), asRequiredString(b.endpoint, "endpoint", { maxLength: 2000 }));
    res.status(204).send();
  }),
);

/** Sends a test notification to every device of the caller. */
router.post(
  "/test",
  asyncHandler(async (req, res) => {
    const delivered = await PushService.sendToUser(getUserId(req), {
      title: "Prometheus",
      body: "Notifications are on. Task reminders will show up like this.",
      url: "/todos/today",
      tag: "test",
    });
    res.status(200).json({ delivered });
  }),
);

export default router;
