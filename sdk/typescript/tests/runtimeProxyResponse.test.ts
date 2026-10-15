import { describe, expect, test } from "bun:test";
import { createRuntimeProxyResponse } from "../src/runtimeProxyResponse";

describe("createRuntimeProxyResponse", () => {
  test.each([204, 205, 304])("constructs status %i without a response body", (status) => {
    const response = createRuntimeProxyResponse({
      status,
      statusText: "No Content",
      body: "",
    });

    expect(response.status).toBe(status);
    expect(response.body).toBeNull();
  });

  test("preserves response bodies and content types when the status allows one", async () => {
    const response = createRuntimeProxyResponse({
      status: 200,
      statusText: "OK",
      contentType: "application/json",
      body: '{"ok":true}',
    });

    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
