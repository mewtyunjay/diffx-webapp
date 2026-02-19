import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import {
  setQuizGeneratorProviderForTests,
  type QuizGeneratorProvider,
} from "../services/quiz/provider-registry.js";
import { resetQuizSessionsForTests } from "../services/quiz/quiz-session.service.js";
import { resetSettingsForTests, updateSettings } from "../services/settings/settings.service.js";

function createDeterministicProvider(): QuizGeneratorProvider {
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

    async generateQuiz(input) {
      return {
        title: "Commit readiness quiz",
        generatedAt: new Date().toISOString(),
        questions: Array.from({ length: input.questionCount }, (_, index) => ({
          id: `q-${index + 1}`,
          prompt: `Question ${index + 1}`,
          snippet: null,
          options: ["A", "B", "C", "D"],
          correctOptionIndex: index % 4,
          explanation: null,
          tags: ["test"],
        })),
      };
    },
  };
}

async function waitForSession(
  app: ReturnType<typeof createApp>,
  sessionId: string,
): Promise<{
  status: string;
  sourceFingerprint: string;
  quiz: { questions: { id: string }[] } | null;
  failure: { message: string } | null;
}> {
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
    updateSettings({
      quiz: {
        gateEnabled: false,
        questionCount: 4,
        scope: "all_changes",
        validationMode: "answer_all",
        scoreThreshold: null,
        providerPreference: "auto",
      },
    });
    resetQuizSessionsForTests();
    setQuizGeneratorProviderForTests(createDeterministicProvider());
  });

  it("rejects session creation without commit message", async () => {
    const app = createApp();

    const response = await request(app).post("/api/quiz/sessions").send({ selectedPath: null });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: "INVALID_COMMIT_MESSAGE" });
  });

  it("allows session creation with an empty commit message", async () => {
    const app = createApp();

    const response = await request(app).post("/api/quiz/sessions").send({
      commitMessage: "",
      selectedPath: null,
    });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ status: "queued", commitMessageDraft: "" });
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

  it("returns provider availability statuses", async () => {
    const app = createApp();

    const response = await request(app).get("/api/quiz/providers");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      providers: [
        { id: "codex", available: true },
        { id: "claude", available: false },
        { id: "opencode", available: false },
      ],
    });
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

  it("marks session as failed when provider throws", async () => {
    const app = createApp();

    setQuizGeneratorProviderForTests({
      id: "codex",

      getAgentConfig() {
        return {
          provider: "throwing-test-provider",
          model: "deterministic",
          reasoningEffort: "n/a",
        };
      },

      async generateQuiz() {
        throw new Error("codex unavailable");
      },
    });

    const createResponse = await request(app).post("/api/quiz/sessions").send({
      commitMessage: "wire quiz gate",
      selectedPath: null,
    });

    expect(createResponse.status).toBe(201);

    const session = await waitForSession(app, createResponse.body.id);

    expect(session.status).toBe("failed");
    expect(session.quiz).toBeNull();
    expect(session.failure).toMatchObject({ message: "codex unavailable" });
  });
});
