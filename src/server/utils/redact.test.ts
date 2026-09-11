import { describe, expect, it } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it("redacts keys in strings, objects, and nested structures — never leaks", () => {
    const key = "gsk_abc123XYZ456";
    expect(redactSecrets(`key is ${key} done`)).not.toContain(key);
    const obj = redactSecrets({ apiKey: key, nested: { token: key }, ok: "fine" }) as Record<string, unknown>;
    expect(JSON.stringify(obj)).not.toContain(key);
    expect(obj.ok).toBe("fine");
  });
});
