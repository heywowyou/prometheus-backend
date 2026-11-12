import { getUserId } from "../../core/auth";
import { asyncHandler } from "../../core/http";
import { exportUserData } from "./export.service";

export const downloadExport = asyncHandler(async (req, res) => {
  const data = await exportUserData(getUserId(req));
  const day = data.exportedAt.slice(0, 10);

  res
    .status(200)
    .set("Content-Disposition", `attachment; filename="prometheus-backup-${day}.json"`)
    .set("Cache-Control", "no-store")
    .json(data);
});
