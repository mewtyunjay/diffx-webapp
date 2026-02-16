import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /api/diff-detail validation", () => {
  it("rejects when path is missing", async () => {
    const app = createApp();

    const response = await request(app).get("/api/diff-detail").query({ scope: "unstaged" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PATH",
    });
  });

  it("rejects unsupported scope", async () => {
    const app = createApp();

    const response = await request(app)
      .get("/api/diff-detail")
      .query({ path: "backend/src/app.ts", scope: "everything" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_SCOPE",
    });
  });

  it("rejects invalid contextLines", async () => {
    const app = createApp();

    const response = await request(app)
      .get("/api/diff-detail")
      .query({ path: "backend/src/app.ts", scope: "unstaged", contextLines: "-1" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PATH",
    });
  });
});
