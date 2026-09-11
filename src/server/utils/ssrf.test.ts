import { describe, expect, it } from "vitest";
import { isBlockedIp, ssrfBlockReason } from "./ssrf.js";

describe("ssrf guard", () => {
  it("blocks private, loopback, link-local, metadata, and reserved ranges", () => {
    for (const ip of [
      "10.0.0.5",
      "127.0.0.1",
      "169.254.169.254",
      "172.16.4.2",
      "172.31.255.1",
      "192.168.1.1",
      "0.0.0.0",
      "224.0.0.1",
      "::1",
      "::",
      "::ffff:127.0.0.1",
      // Bypass spellings: hex / compressed / full-form equivalents of blocked IPs
      "::ffff:7f00:1",
      "::ffff:7F00:0001",
      "0:0:0:0:0:0:0:1",
      "0:0:0:0:0:ffff:a00:1",
      "fe80::1",
      "fc00::1",
      "ff02::1",
      "localhost",
    ]) {
      expect(isBlockedIp(ip), ip).toBe(true);
    }
  });

  it("allows public IPs", () => {
    for (const ip of ["8.8.8.8", "93.184.216.34", "1.1.1.1", "172.15.0.1", "172.32.0.1"]) {
      expect(isBlockedIp(ip), ip).toBe(false);
    }
  });

  it("rejects non-http protocols and unresolvable hosts (fail closed)", async () => {
    expect(await ssrfBlockReason("ftp://example.com/f")).toMatch(/protocol/);
    expect(await ssrfBlockReason("file:///etc/passwd")).toMatch(/protocol/);
    expect(await ssrfBlockReason("not a url")).toMatch(/invalid URL/);
    expect(await ssrfBlockReason("http://169.254.169.254/latest")).toMatch(/blocked IP/);
    expect(
      await ssrfBlockReason("https://example.com/", async () => {
        throw new Error("dns down");
      })
    ).toMatch(/DNS/);
  });

  it("blocks hostnames resolving to private space, allows public ones", async () => {
    const private_ = await ssrfBlockReason("https://internal.example/", async () => [{ address: "10.1.2.3" }]);
    expect(private_).toMatch(/blocked IP/);
    expect(await ssrfBlockReason("https://example.com/", async () => [{ address: "93.184.216.34" }])).toBeNull();
  });

  it("blocks IPv6-literal URLs that spell blocked addresses", async () => {
    expect(await ssrfBlockReason("http://[::ffff:7f00:1]/")).toMatch(/blocked IP/);
    expect(await ssrfBlockReason("http://[0:0:0:0:0:0:0:1]/")).toMatch(/blocked IP/);
  });
});
