import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("POST /api/actions validation", () => {
  it("rejects stage request without path", async () => {
    const app = createApp();

    const response = await request(app).post("/api/actions/stage").send({});

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PATH",
    });
  });

  it("rejects commit request without message", async () => {
    const app = createApp();

    const response = await request(app).post("/api/actions/commit").send({ message: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_COMMIT_MESSAGE",
    });
  });

  it("rejects commit-message generation request with invalid draft type", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/actions/commit-message")
      .send({ draft: 42 });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_COMMIT_MESSAGE",
    });
  });

  it("returns generated commit message suggestion in test runtime", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/actions/commit-message")
      .send({ draft: "" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      message: "update staged changes",
    });
  });

  it("rejects stage-many request with invalid paths", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/actions/stage-many")
      .send({ paths: ["src/app.ts", "   "] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PATH",
    });
  });

  it("rejects unstage-many request with invalid paths", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/actions/unstage-many")
      .send({ paths: ["src/app.ts", "   "] });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PATH",
    });
  });

  it("rejects push request with invalid createUpstream flag", async () => {
    const app = createApp();

    const response = await request(app)
      .post("/api/actions/push")
      .send({ createUpstream: "yes" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PUSH_REQUEST",
    });
  });
});
