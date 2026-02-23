import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /api/file-contents validation", () => {
  it("rejects when path is missing", async () => {
    const app = createApp();

    const response = await request(app)
      .get("/api/file-contents")
      .query({ scope: "unstaged", side: "new" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_PATH",
    });
  });

  it("rejects unsupported scope", async () => {
    const app = createApp();

    const response = await request(app)
      .get("/api/file-contents")
      .query({ path: "backend/src/app.ts", scope: "everything", side: "new" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_SCOPE",
    });
  });

  it("rejects unsupported side", async () => {
    const app = createApp();

    const response = await request(app)
      .get("/api/file-contents")
      .query({ path: "backend/src/app.ts", scope: "unstaged", side: "middle" });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_SIDE",
    });
  });
});
