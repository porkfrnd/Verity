import { afterEach, describe, expect, it, vi } from "vitest";
import { API_UNREACHABLE_MESSAGE, investigateClaim, testConnection } from "../api.js";

function jsonResponse(body: unknown, status = 200, contentType = "application/json"): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": contentType },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api error surfacing", () => {
  it("passes through typed JSON API errors unchanged", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "invalid_request", message: "Claim is required." }, 400)));
    await expect(investigateClaim("x")).rejects.toThrow("Claim is required.");
  });

  it("passes through genuine JSON 5xx errors field-for-field (never replaced)", async () => {
    const payload = { error: "investigation_failed", message: "The investigation could not be completed. Try again." };
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(payload, 502)));
    const err = await investigateClaim("Water boils.").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe(payload.message);
  });

  it("falls back to the generic status text for JSON errors without a message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ error: "internal" }, 500)));
    await expect(investigateClaim("Water boils.")).rejects.toThrow("Request failed with status 500");
  });

  it("treats an empty 500 body as unreachable (no JSON to parse)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 500 })));
    await expect(investigateClaim("Water boils.")).rejects.toThrow(API_UNREACHABLE_MESSAGE);
  });

  it("maps a non-JSON proxy 500 (API down) to the actionable message", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("<html>proxy error</html>", 500, "text/html")));
    await expect(investigateClaim("Water boils.")).rejects.toThrow(API_UNREACHABLE_MESSAGE);
  });

  it("maps a network-level failure to the actionable message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      })
    );
    await expect(investigateClaim("Water boils.")).rejects.toThrow(API_UNREACHABLE_MESSAGE);
    await expect(testConnection()).resolves.toMatchObject({ ok: false, message: API_UNREACHABLE_MESSAGE });
  });

  it("test-connection surfaces proxy 500s instead of a bare status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse("bad gateway", 502, "text/html")));
    await expect(testConnection()).resolves.toMatchObject({ ok: false, message: API_UNREACHABLE_MESSAGE });
  });

  it("re-throws intentional aborts instead of misreporting an outage", async () => {
    const abort = new DOMException("aborted", "AbortError");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw abort;
      })
    );
    await expect(investigateClaim("Water boils.")).rejects.toBe(abort);
  });
});
