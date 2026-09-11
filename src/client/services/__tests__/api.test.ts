import { afterEach, describe, expect, it, vi } from "vitest";
import { API_UNREACHABLE_MESSAGE, investigateClaim, investigateClaimStream, parseSseBuffer, testConnection } from "../api.js";
import type { Investigation } from "../../../shared/types.js";

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

describe("SSE stream parsing", () => {
  it("parses complete frames and holds back partial ones", () => {
    const { events, rest } = parseSseBuffer(
      'event: provider\ndata: {"provider":"duckduckgo"}\n\nevent: dedup\ndata: {"totalFound":'
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "provider" });
    expect(rest).toContain("totalFound");
    const again = parseSseBuffer(`${rest}17}\n\n`);
    expect(again.events).toHaveLength(1);
    expect(again.events[0]).toMatchObject({ type: "dedup" });
  });

  it("skips malformed frames without killing the stream", () => {
    const { events } = parseSseBuffer("event: provider\ndata: not-json{{\n\nevent: done\ndata: {\"ok\":true}\n\n");
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("done");
  });
});

describe("investigateClaimStream", () => {
  const inv = { id: "inv-1", originalClaim: "x", depth: "flash", extraction: { original_claim: "x", claims: [], searchQueries: {}, verifiability: {} }, results: [], createdAt: "t" } as unknown as Investigation;

  function sseResponse(frames: string[]): Response {
    const stream = new ReadableStream({
      start(controller) {
        for (const f of frames) controller.enqueue(new TextEncoder().encode(f));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }

  it("emits live events and resolves with the done investigation", async () => {
    const seen: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        sseResponse([
          'event: provider\ndata: {"provider":"duckduckgo","status":"success"}\n\n',
          `event: done\ndata: ${JSON.stringify(inv)}\n\n`,
        ])
      )
    );
    const out = await investigateClaimStream("x", "flash", (e) => seen.push(e.type));
    expect(seen).toEqual(["provider"]);
    expect(out.id).toBe("inv-1");
  });

  it("rejects on stream error events and falls back cleanly on truncation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(['event: error\ndata: {"message":"boom"}\n\n'])));
    await expect(investigateClaimStream("x", "flash", () => {})).rejects.toThrow("boom");
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(['event: provider\ndata: {"a":1}\n\n'])));
    await expect(investigateClaimStream("x", "flash", () => {})).rejects.toThrow("STREAM_INCOMPLETE");
  });
});
