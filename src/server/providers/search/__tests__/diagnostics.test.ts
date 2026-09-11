import { describe, expect, it, vi } from "vitest";
import { causeFingerprint, describeError } from "../types.js";
import { parseDuckDuckGoHtml } from "../duckduckgo.js";

describe("describeError", () => {
  it("unpacks undici-style cause chains into safe fields", () => {
    const cause = Object.assign(new Error("other side closed"), {
      code: "ECONNRESET",
      errno: -104,
      syscall: "read",
      hostname: "api.example.com",
      address: "93.184.216.34",
      port: 443,
    });
    const err = new TypeError("fetch failed", { cause });
    const d = describeError(err);
    expect(d).toMatchObject({
      name: "TypeError",
      message: "fetch failed",
      causeName: "Error",
      code: "ECONNRESET",
      errno: -104,
      syscall: "read",
      hostname: "api.example.com",
      address: "93.184.216.34",
      port: 443,
    });
  });

  it("handles causeless and non-error values without throwing", () => {
    expect(describeError(new Error("plain"))).toMatchObject({ name: "Error", message: "plain" });
    expect(describeError("string failure")).toMatchObject({ name: "string" });
    expect(describeError(null).name).toBe("object");
  });

  it("never includes URLs, headers, or credential-shaped fields", () => {
    const cause = Object.assign(new Error("x"), {
      code: "EAI_AGAIN",
      url: "https://h/?key=SECRET",
      headers: { authorization: "Bearer SECRET" },
    });
    const d = describeError(new TypeError("fetch failed", { cause }));
    expect(JSON.stringify(d)).not.toContain("SECRET");
    expect(JSON.stringify(d)).not.toContain("authorization");
    expect(Object.keys(d)).toEqual(
      expect.arrayContaining(["name", "message", "causeName", "causeMessage", "code"])
    );
  });
});

describe("causeFingerprint", () => {
  it("classifies timeout vs http vs abort vs unknown", () => {
    expect(causeFingerprint(Object.assign(new Error("x"), { code: "ETIMEDOUT" }))).toMatch(/timeout/);
    expect(causeFingerprint(new Error("status 503 boom"))).toBe("http:503");
    expect(causeFingerprint(new DOMException("aborted", "AbortError"))).toBe("aborted");
    expect(causeFingerprint(new DOMException("The operation was aborted due to timeout", "TimeoutError"))).toBe("timeout");
    expect(causeFingerprint(new Error("weird thing happened"))).toMatch(/weird/);
  });
});

describe("DuckDuckGo structural diagnostics", () => {
  it("parse failure carries safe structural detail, never page content", () => {
    const html = "<html><head><title>Attention Required! | Cloudflare</title></head><body><div class='cf'>prove human二次</div></body></html>";
    let caught: unknown = null;
    try {
      parseDuckDuckGoHtml(html, { httpStatus: 200, contentType: "text/html", finalUrl: "https://html.duckduckgo.com/html/" });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const detail = (caught as { detail?: Record<string, unknown> }).detail ?? {};
    expect(detail).toMatchObject({ httpStatus: 200, contentType: "text/html", finalHost: "html.duckduckgo.com", hasAnomaly: true });
    expect(typeof detail.bodyLength).toBe("number");
    expect(JSON.stringify(detail)).not.toContain("prove human");
  });

  it("differentiates empty results from markup failure", () => {
    expect(parseDuckDuckGoHtml('<html><body><div class="no-results">No results</div></body></html>')).toEqual([]);
    expect(() => parseDuckDuckGoHtml("<html><body><p>hello</p></body></html>")).toThrow(/no result nodes/);
  });
});

describe("diagnoseProviders injection seam", () => {
  it("runs exactly one query per injected provider", async () => {
    const { diagnoseProviders } = await import("../../../services/diagnose.js");
    const calls: string[] = [];
    const ok = {
      id: "stub-ok",
      search: vi.fn(async (q: string) => {
        calls.push(q);
        return [{ title: "T", url: "https://example.com/t", snippet: "S" }];
      }),
    };
    const failing = {
      id: "stub-fail",
      search: vi.fn(async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      }),
    };
    const reports = await diagnoseProviders([ok, failing] as never);
    expect(calls).toHaveLength(1);
    expect(reports.find((r) => r.provider === "stub-ok")).toMatchObject({ status: "success", sources: 1 });
    expect(reports.find((r) => r.provider === "stub-fail")).toMatchObject({ status: "error" });
  });
});
