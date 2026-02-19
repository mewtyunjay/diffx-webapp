import { Router } from "express";
import type {
  CreateQuizSessionRequest,
  GetQuizProvidersResponse,
  SubmitQuizAnswersRequest,
  ValidateQuizSessionRequest,
} from "@diffx/contracts";
import {
  createQuizSession,
  getQuizSession,
  getQuizSessionInitialEvents,
  submitQuizAnswers,
  subscribeToQuizSession,
  validateQuizSession,
} from "../services/quiz/quiz-session.service.js";
import { getQuizProviderStatuses } from "../services/quiz/provider-registry.js";
import { sendRouteError } from "./http.js";

const router = Router();

router.get("/quiz/providers", async (_req, res) => {
  try {
    const providers = await getQuizProviderStatuses();
    const payload: GetQuizProvidersResponse = { providers };
    res.json(payload);
  } catch (error) {
    sendRouteError(res, error);
  }
});

function writeSseEvent(
  res: {
    write: (chunk: string) => void;
  },
  event: { type: string },
  payload: unknown,
) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

router.post("/quiz/sessions", async (req, res) => {
  try {
    const body = req.body as CreateQuizSessionRequest;
    const session = await createQuizSession(body);
    res.status(201).json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/quiz/sessions/:id", (req, res) => {
  try {
    const session = getQuizSession(req.params.id ?? "");
    res.json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/quiz/sessions/:id/stream", (req, res) => {
  let unsubscribe: (() => void) | null = null;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  try {
    const sessionId = req.params.id ?? "";

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const initialEvents = getQuizSessionInitialEvents(sessionId);
    for (const event of initialEvents) {
      writeSseEvent(res, event, event);
    }

    unsubscribe = subscribeToQuizSession(sessionId, (event) => {
      writeSseEvent(res, event, event);
    });

    keepAliveTimer = setInterval(() => {
      res.write(":keepalive\n\n");
    }, 15000);

    req.on("close", () => {
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
      }

      unsubscribe?.();
      res.end();
    });
  } catch (error) {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
    }

    unsubscribe?.();
    sendRouteError(res, error);
  }
});

router.post("/quiz/sessions/:id/answers", (req, res) => {
  try {
    const body = req.body as SubmitQuizAnswersRequest;
    const session = submitQuizAnswers(req.params.id ?? "", body);
    res.json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/quiz/sessions/:id/validate", async (req, res) => {
  try {
    const body = req.body as ValidateQuizSessionRequest;
    const session = await validateQuizSession(req.params.id ?? "", body);
    res.json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

export default router;
