import { Router } from "express";
import type { PutSettingsRequest } from "@diffx/contracts";
import { getSettings, updateSettings } from "../services/settings/settings.service.js";
import { sendRouteError } from "./http.js";

const router = Router();

router.get("/settings", (_req, res) => {
  try {
    res.json(getSettings());
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.put("/settings", (req, res) => {
  try {
    const body = req.body as PutSettingsRequest;
    const updated = updateSettings(body);
    res.json(updated);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
