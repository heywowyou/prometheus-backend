import type { RequestHandler } from "express";
import { getAuth } from "@clerk/express";

const requireUser: RequestHandler = (req, res, next) => {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  next();
};

export default requireUser;

