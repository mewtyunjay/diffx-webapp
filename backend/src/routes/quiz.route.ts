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
import { logBackendEvent } from "../logging/logger.js";
import { getQuizProviderStatuses } from "../services/quiz/provider-registry.js";
import { sendRouteError } from "./http.js";

const router = Router();

router.get("/quiz/providers", async (_req, res) => {
  try {
    const providers = await getQuizProviderStatuses();
    logBackendEvent("provider", "info", "provider:status-requested", {
      total: providers.length,
      available: providers.filter((provider) => provider.available).length,
    });
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
  const sessionId = req.params.id ?? "";

  const cleanupStream = () => {
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }

    unsubscribe?.();
    unsubscribe = null;
  };

  const closeStreamWithError = (message: string, retryable = true) => {
    cleanupStream();

    if (res.writableEnded) {
      return;
    }

    try {
      const session = getQuizSession(sessionId);
      writeSseEvent(
        res,
        { type: "session_error" },
        {
          type: "session_error",
          session,
          retryable,
          message,
        },
      );
      writeSseEvent(
        res,
        { type: "session_complete" },
        {
          type: "session_complete",
          session,
        },
      );
    } catch {
      // If the session no longer exists, end stream silently.
    }

    res.end();
  };

  let initialEvents: ReturnType<typeof getQuizSessionInitialEvents>;

  try {
    initialEvents = getQuizSessionInitialEvents(sessionId);
  } catch (error) {
    sendRouteError(res, error);
    return;
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    logBackendEvent("quiz", "info", "sse:connected", {
      sessionId,
      initialEvents: initialEvents.length,
    });

    for (const event of initialEvents) {
      logBackendEvent("quiz", "debug", "sse:emit", {
        sessionId,
        eventType: event.type,
        source: "initial",
      });
      writeSseEvent(res, event, event);
    }

    unsubscribe = subscribeToQuizSession(sessionId, (event) => {
      logBackendEvent("quiz", "debug", "sse:emit", {
        sessionId,
        eventType: event.type,
        source: "live",
      });

      try {
        writeSseEvent(res, event, event);
      } catch {
        closeStreamWithError("Quiz progress stream failed.");
      }
    });

    keepAliveTimer = setInterval(() => {
      try {
        res.write(":keepalive\n\n");
      } catch {
        closeStreamWithError("Quiz progress stream failed.");
      }
    }, 15000);

    req.on("close", () => {
      cleanupStream();
      logBackendEvent("quiz", "info", "sse:disconnected", {
        sessionId,
      });
    });
  } catch (error) {
    const message = error instanceof Error && error.message.length > 0
      ? error.message
      : "Quiz progress stream failed.";
    closeStreamWithError(message);
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
