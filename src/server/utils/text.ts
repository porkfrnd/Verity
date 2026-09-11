export function canonicalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hash = "";
    // Drop common tracking params
    const drop = new Set(["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"]);
    for (const k of [...u.searchParams.keys()]) {
      if (drop.has(k)) u.searchParams.delete(k);
    }
    let s = u.toString();
    // Trailing slash normalization (keep root slash)
    if (s.length > u.origin.length + 1 && s.endsWith("/")) s = s.slice(0, -1);
    return s.toLowerCase();
  } catch {
    return raw.trim().toLowerCase().replace(/\/$/, "");
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Decode HTML entities (named + decimal/hex numeric) in snippet text. */
export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code);
      return Number.isSafeInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : _;
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => {
      const n = parseInt(hex, 16);
      return Number.isSafeInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : _;
    })
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function stripBoilerplate(htmlOrText: string): string {
  // Lightweight readability-style strip: remove script/style/nav-ish noise,
  // collapse whitespace, cap length. Input may already be plain text.
  let text = htmlOrText
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  // Decode entities (named + numeric)
  text = decodeEntities(text);
  return normalizeWhitespace(text).slice(0, 6000);
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2)
  );
}

export function jaccardSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function normalizeClaimText(claim: string): string {
  return normalizeWhitespace(claim.toLowerCase()).replace(/[."'`!?;:,]+$/g, "");
}
