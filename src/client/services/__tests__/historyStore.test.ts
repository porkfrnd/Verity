import { describe, expect, it } from "vitest";
import {
  HISTORY_STORAGE_KEY,
  MAX_HISTORY_ITEMS,
  addToHistory,
  clearHistory,
  isValidInvestigation,
  loadHistory,
  removeFromHistory,
  saveHistory,
  type StorageLike,
} from "../historyStore.js";
import type { Investigation } from "../../../shared/types.js";

function memoryStorage(initial?: Record<string, string>): StorageLike & { dump(): Record<string, string> } {
  const data: Record<string, string> = { ...(initial ?? {}) };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
    dump: () => ({ ...data }),
  };
}

function inv(id: string, createdAt = "2026-09-11T06:00:00.000Z", extra?: Record<string, unknown>): Investigation {
  return {
    id,
    originalClaim: `Claim ${id}`,
    depth: "deep",
    extraction: { original_claim: `Claim ${id}`, claims: [], searchQueries: {}, verifiability: {} },
    results: [],
    createdAt,
    ...extra,
  } as Investigation;
}

describe("historyStore", () => {
  it("1. writes completed investigations to browser localStorage", () => {
    const storage = memoryStorage();
    const next = addToHistory([], inv("a"), storage);
    expect(next).toHaveLength(1);
    const raw = storage.dump()[HISTORY_STORAGE_KEY];
    expect(raw).toBeDefined();
    expect(JSON.parse(raw)[0].id).toBe("a");
    expect(JSON.parse(raw)[0].originalClaim).toBe("Claim a");
  });

  it("2. restores history after reload, newest first", () => {
    const storage = memoryStorage();
    addToHistory([], inv("old", "2026-09-10T06:00:00.000Z"), storage);
    addToHistory(loadHistory(storage), inv("new", "2026-09-11T06:00:00.000Z"), storage);
    // Simulate reload: fresh load from the same storage.
    const restored = loadHistory(storage);
    expect(restored.map((h) => h.id)).toEqual(["new", "old"]);
  });

  it("3. different stored contents produce different histories (per-browser data)", () => {
    const userA = memoryStorage();
    const userB = memoryStorage();
    addToHistory([], inv("a-claim"), userA);
    expect(loadHistory(userA).map((h) => h.id)).toEqual(["a-claim"]);
    expect(loadHistory(userB)).toEqual([]);
  });

  it("5. individual deletion removes one record and persists", () => {
    const storage = memoryStorage();
    let list = addToHistory([], inv("a"), storage);
    list = addToHistory(list, inv("b"), storage);
    list = removeFromHistory(list, "a", storage);
    expect(list.map((h) => h.id)).toEqual(["b"]);
    expect(loadHistory(storage).map((h) => h.id)).toEqual(["b"]);
  });

  it("6. clear-all empties history and storage", () => {
    const storage = memoryStorage();
    addToHistory([], inv("a"), storage);
    expect(clearHistory(storage)).toEqual([]);
    expect(loadHistory(storage)).toEqual([]);
    expect(HISTORY_STORAGE_KEY in storage.dump()).toBe(false);
  });

  it("caps size, evicting oldest first", () => {
    const storage = memoryStorage();
    let list: Investigation[] = [];
    for (let i = 0; i < MAX_HISTORY_ITEMS + 5; i++) {
      list = addToHistory(list, inv(`id-${i}`, `2026-09-${String((i % 28) + 1).padStart(2, "0")}T06:00:00.000Z`), storage);
    }
    expect(list).toHaveLength(MAX_HISTORY_ITEMS);
    expect(list.map((h) => h.id)).not.toContain("id-0");
    expect(loadHistory(storage)).toHaveLength(MAX_HISTORY_ITEMS);
  });

  it("7. corrupted localStorage never crashes: garbage, non-arrays, invalid records", () => {
    expect(loadHistory(memoryStorage({ [HISTORY_STORAGE_KEY]: "not-json{{{" }))).toEqual([]);
    expect(loadHistory(memoryStorage({ [HISTORY_STORAGE_KEY]: '"just a string"' }))).toEqual([]);
    expect(loadHistory(memoryStorage({ [HISTORY_STORAGE_KEY]: '{"id":1}' }))).toEqual([]);
    const mixed = memoryStorage({
      [HISTORY_STORAGE_KEY]: JSON.stringify([inv("good"), { id: "", originalClaim: 42 }, null, "junk"]),
    });
    expect(loadHistory(mixed).map((h) => h.id)).toEqual(["good"]);
    expect(isValidInvestigation({ id: "x", originalClaim: "y", results: [], createdAt: "bad-date" })).toBe(false);
  });

  it("8. storage failures (unavailable, throwing, quota) never crash", () => {
    const throwing: StorageLike = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadHistory(throwing)).toEqual([]);
    expect(loadHistory(null)).toEqual([]);
    expect(saveHistory([inv("a")], throwing)).toBe(false);
    expect(saveHistory([inv("a")], null)).toBe(false);
    // In-memory list operations still work; only persistence is unavailable.
    expect(addToHistory([], inv("a"), throwing)).toHaveLength(1);
    expect(removeFromHistory([inv("a")], "a", throwing)).toEqual([]);
    expect(clearHistory(throwing)).toEqual([]);
    // QuotaExceededError on first write: evicts oldest half and retries.
    let writes = 0;
    let lastValue = "";
    const quota: StorageLike = {
      getItem: () => lastValue || null,
      setItem: (_k, v) => {
        writes++;
        if (writes === 1) {
          const err = new Error("quota exceeded");
          err.name = "QuotaExceededError";
          throw err;
        }
        lastValue = v;
      },
      removeItem: () => {
        lastValue = "";
      },
    };
    const list = [inv("a"), inv("b"), inv("c"), inv("d")];
    expect(saveHistory(list, quota)).toBe(true);
    expect(writes).toBe(2);
  });

  it("never persists secrets (defensive scrub)", () => {
    const storage = memoryStorage();
    const dirty = inv("s", "2026-09-11T06:00:00.000Z", {
      apiKey: "gsk_secret",
      nested: { token: "tok", fine: "keep me" },
    });
    const next = addToHistory([], dirty, storage);
    expect(JSON.stringify(next)).not.toContain("gsk_secret");
    expect(JSON.stringify(next)).not.toContain("tok");
    expect(JSON.stringify(next)).toContain("keep me");
    expect(next[0].id).toBe("s");
  });
});
