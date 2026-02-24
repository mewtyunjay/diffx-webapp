import { Router } from "express";
import type { CreateCodeReviewSessionRequest } from "@diffx/contracts";
import {
  cancelCodeReviewSession,
  createCodeReviewSession,
  getCodeReviewSession,
  getCodeReviewSessionInitialEvents,
  subscribeToCodeReviewSession,
} from "../services/code-review/code-review-session.service.js";
import { sendRouteError } from "./http.js";

const router = Router();

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

router.post("/code-review/sessions", async (req, res) => {
  try {
    const body = (req.body ?? {}) as CreateCodeReviewSessionRequest;
    const session = await createCodeReviewSession(body);
    res.status(201).json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/code-review/sessions/:id", (req, res) => {
  try {
    const session = getCodeReviewSession(req.params.id ?? "");
    res.json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.post("/code-review/sessions/:id/cancel", (req, res) => {
  try {
    const session = cancelCodeReviewSession(req.params.id ?? "");
    res.json(session);
  } catch (error) {
    sendRouteError(res, error);
  }
});

router.get("/code-review/sessions/:id/stream", (req, res) => {
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
      const session = getCodeReviewSession(sessionId);
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
      // If session no longer exists, end stream silently.
    }

    res.end();
  };

  let initialEvents: ReturnType<typeof getCodeReviewSessionInitialEvents>;

  try {
    initialEvents = getCodeReviewSessionInitialEvents(sessionId);
  } catch (error) {
    sendRouteError(res, error);
    return;
  }

  try {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    for (const event of initialEvents) {
      writeSseEvent(res, event, event);
    }

    unsubscribe = subscribeToCodeReviewSession(sessionId, (event) => {
      try {
        writeSseEvent(res, event, event);
      } catch {
        closeStreamWithError("Code review progress stream failed.");
      }
    });

    keepAliveTimer = setInterval(() => {
      try {
        res.write(":keepalive\n\n");
      } catch {
        closeStreamWithError("Code review progress stream failed.");
      }
    }, 15000);

    req.on("close", () => {
      cleanupStream();
    });
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "Code review progress stream failed.";

    closeStreamWithError(message);
  }
});

export default router;
