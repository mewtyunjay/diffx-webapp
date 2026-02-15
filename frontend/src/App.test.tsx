import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { getHealth } from "./services/api/health";

vi.mock("./services/api/health", () => ({
  getHealth: vi.fn(),
}));

describe("App", () => {
  const getHealthMock = vi.mocked(getHealth);

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows connected status after successful health request", async () => {
    getHealthMock.mockResolvedValue({ ok: true });

    render(<App />);

    expect(await screen.findByText("backend connected")).toBeInTheDocument();
  });

  it("shows disconnected status after failed health request", async () => {
    getHealthMock.mockRejectedValue(new Error("network failed"));

    render(<App />);

    expect(await screen.findByText("backend disconnected")).toBeInTheDocument();
  });
});
