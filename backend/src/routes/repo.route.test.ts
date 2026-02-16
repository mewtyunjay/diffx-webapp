import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /api/repo", () => {
  it("returns repo summary with remote hash", async () => {
    const app = createApp();

    const response = await request(app).get("/api/repo");

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      mode: "git",
    });
    expect(typeof response.body.remoteHash).toBe("string");
    expect(response.body.remoteHash.length).toBeGreaterThan(0);
  });
});
