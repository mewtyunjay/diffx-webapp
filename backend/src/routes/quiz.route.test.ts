import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetQuizSessionsForTests } from "../services/quiz/quiz-session.service.js";
import { resetSettingsForTests } from "../services/settings/settings.service.js";

async function waitForSession(
  app: ReturnType<typeof createApp>,
  sessionId: string,
): Promise<{ status: string; sourceFingerprint: string; quiz: { questions: { id: string }[] } | null }> {
  const deadline = Date.now() + 2000;

  while (Date.now() < deadline) {
    const response = await request(app).get(`/api/quiz/sessions/${sessionId}`);

    if (response.status !== 200) {
      throw new Error(`Failed to load session ${sessionId}`);
    }

    if (response.body.status === "ready" || response.body.status === "failed") {
      return response.body;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Session ${sessionId} did not reach terminal generation state in time.`);
}

describe("/api/quiz", () => {
  beforeEach(() => {
    resetSettingsForTests();
    resetQuizSessionsForTests();
  });

  it("rejects session creation without commit message", async () => {
    const app = createApp();

    const response = await request(app).post("/api/quiz/sessions").send({ selectedPath: null });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "INVALID_COMMIT_MESSAGE" });
  });

  it("creates and retrieves a quiz session", async () => {
    const app = createApp();

    const createResponse = await request(app).post("/api/quiz/sessions").send({
      commitMessage: "wire quiz mode",
      selectedPath: null,
    });

    expect(createResponse.status).toBe(201);
    expect(createResponse.body).toMatchObject({ status: "queued" });

    const getResponse = await request(app).get(`/api/quiz/sessions/${createResponse.body.id}`);

    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(createResponse.body.id);
  });

  it("validates quiz after answer submission", async () => {
    const app = createApp();

    const createResponse = await request(app).post("/api/quiz/sessions").send({
      commitMessage: "wire quiz gate",
      selectedPath: null,
    });

    expect(createResponse.status).toBe(201);

    const session = await waitForSession(app, createResponse.body.id);
    expect(session.status).toBe("ready");
    expect(session.quiz).not.toBeNull();

    const answers = Object.fromEntries(
      session.quiz!.questions.map((question, index) => [question.id, index % 4]),
    );

    const answerResponse = await request(app)
      .post(`/api/quiz/sessions/${createResponse.body.id}/answers`)
      .send({ answers });

    expect(answerResponse.status).toBe(200);

    const validateResponse = await request(app)
      .post(`/api/quiz/sessions/${createResponse.body.id}/validate`)
      .send({ sourceFingerprint: session.sourceFingerprint });

    expect(validateResponse.status).toBe(200);
    expect(validateResponse.body).toMatchObject({ status: "validated" });
  });

  it("rejects validation when source fingerprint mismatches", async () => {
    const app = createApp();

    const createResponse = await request(app).post("/api/quiz/sessions").send({
      commitMessage: "wire quiz gate",
      selectedPath: null,
    });

    expect(createResponse.status).toBe(201);

    const session = await waitForSession(app, createResponse.body.id);

    if (!session.quiz) {
      throw new Error("Expected generated quiz payload.");
    }

    const answerResponse = await request(app)
      .post(`/api/quiz/sessions/${createResponse.body.id}/answers`)
      .send({ answers: { [session.quiz.questions[0]!.id]: 0 } });

    expect(answerResponse.status).toBe(200);

    const validateResponse = await request(app)
      .post(`/api/quiz/sessions/${createResponse.body.id}/validate`)
      .send({ sourceFingerprint: "stale-fingerprint" });

    expect(validateResponse.status).toBe(409);
    expect(validateResponse.body).toMatchObject({ code: "QUIZ_REPO_STATE_CHANGED" });
  });
});
