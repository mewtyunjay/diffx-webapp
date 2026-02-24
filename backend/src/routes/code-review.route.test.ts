import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  setCodeReviewProviderForTests,
  type CodeReviewProvider,
} from "../services/code-review/provider-registry.js";
import { resetCodeReviewSessionsForTests } from "../services/code-review/code-review-session.service.js";
import { CODE_REVIEW_SPECIALISTS } from "../services/code-review/specialists.js";

function createDeterministicProvider(): CodeReviewProvider {
  return {
    id: "codex",
    async checkAvailability() {
      return { available: true };
    },
    getAgentConfig() {
      return {
        provider: "deterministic-test-provider",
        model: "deterministic",
        reasoningEffort: "n/a",
      };
    },
    async runSpecialist(input) {
      return {
        findings: [
          {
            severity: input.specialist.id === "security" ? "high" : "medium",
            type: input.specialist.defaultType,
            title: `${input.specialist.title} finding`,
            summary: "Deterministic finding for route test coverage.",
            path: input.focusFiles[0] ?? "unknown",
            lineStart: 1,
            lineEnd: 1,
          },
        ],
      };
    },
  };
}

function createSlowProvider(delayMs: number): CodeReviewProvider {
  return {
    id: "codex",
    async checkAvailability() {
      return { available: true };
    },
    getAgentConfig() {
      return {
        provider: "slow-test-provider",
        model: "deterministic",
        reasoningEffort: "n/a",
      };
    },
    async runSpecialist(input) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        findings: [
          {
            severity: "low",
            type: input.specialist.defaultType,
            title: `${input.specialist.id} finding`,
            summary: "Slow provider finding.",
            path: input.focusFiles[0] ?? "unknown",
            lineStart: 1,
            lineEnd: 1,
          },
        ],
      };
    },
  };
}

async function waitForCodeReviewSession(
  app: ReturnType<typeof createApp>,
  sessionId: string,
  terminalStatuses: Array<"ready" | "failed" | "cancelled">,
) {
  const deadline = Date.now() + 5000;

  while (Date.now() < deadline) {
    const response = await request(app).get(`/api/code-review/sessions/${sessionId}`);

    if (response.status !== 200) {
      throw new Error(`Failed to load code review session ${sessionId}`);
    }

    if (terminalStatuses.includes(response.body.status)) {
      return response.body;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Code review session ${sessionId} did not reach terminal state in time.`);
}

describe("/api/code-review", () => {
  beforeEach(() => {
    resetCodeReviewSessionsForTests();
    setCodeReviewProviderForTests(createDeterministicProvider());
  });

  it("creates a code review session and returns findings", async () => {
    const app = createApp();

    const createResponse = await request(app).post("/api/code-review/sessions").send({});

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({
      status: "queued",
    });

    const session = await waitForCodeReviewSession(app, createResponse.body.id, ["ready", "failed"]);

    expect(session.status).toBe("ready");
    expect(session.findings.length).toBeGreaterThanOrEqual(1);
  });

  it("returns typed error for invalid session id", async () => {
    const app = createApp();

    const response = await request(app).get("/api/code-review/sessions/%20");

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "INVALID_REVIEW_SESSION" });
  });

  it("cancels the previous run when a new session starts", async () => {
    const app = createApp();
    setCodeReviewProviderForTests(createSlowProvider(200));

    const first = await request(app).post("/api/code-review/sessions").send({});
    expect(first.status).toBe(201);

    const second = await request(app).post("/api/code-review/sessions").send({});
    expect(second.status).toBe(201);

    const firstSession = await waitForCodeReviewSession(app, first.body.id, ["cancelled", "ready", "failed"]);
    const secondSession = await waitForCodeReviewSession(app, second.body.id, ["ready", "failed"]);

    expect(["cancelled", "ready"]).toContain(firstSession.status);
    expect(secondSession.status).toBe("ready");
    expect(secondSession.findings.length).toBeGreaterThanOrEqual(CODE_REVIEW_SPECIALISTS.length);
  });
});
