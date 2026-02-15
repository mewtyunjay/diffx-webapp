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
});
