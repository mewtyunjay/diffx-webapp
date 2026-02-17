import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { resetSettingsForTests } from "../services/settings/settings.service.js";

describe("/api/settings", () => {
  beforeEach(() => {
    resetSettingsForTests();
  });

  it("returns default settings payload", async () => {
    const app = createApp();

    const response = await request(app).get("/api/settings");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      quiz: {
        gateEnabled: false,
        questionCount: 4,
        scope: "staged",
        validationMode: "answer_all",
        scoreThreshold: null,
      },
    });
  });

  it("rejects invalid threshold combinations", async () => {
    const app = createApp();

    const response = await request(app).put("/api/settings").send({
      quiz: {
        gateEnabled: true,
        questionCount: 4,
        scope: "staged",
        validationMode: "answer_all",
        scoreThreshold: 2,
      },
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      code: "INVALID_SETTINGS",
    });
  });

  it("persists valid settings", async () => {
    const app = createApp();

    const putResponse = await request(app).put("/api/settings").send({
      quiz: {
        gateEnabled: true,
        questionCount: 5,
        scope: "selected_file",
        validationMode: "score_threshold",
        scoreThreshold: 3,
      },
    });

    expect(putResponse.status).toBe(200);

    const getResponse = await request(app).get("/api/settings");

    expect(getResponse.status).toBe(200);
    expect(getResponse.body).toMatchObject({
      quiz: {
        gateEnabled: true,
        questionCount: 5,
        scope: "selected_file",
        validationMode: "score_threshold",
        scoreThreshold: 3,
      },
    });
  });
});
