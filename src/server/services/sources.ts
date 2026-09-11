import type { Source, SourceType, SearchResultItem, QualityLabel } from "../../shared/types.js";
import { canonicalizeUrl, domainOf, jaccardSimilarity, stripBoilerplate } from "../utils/text.js";

let counter = 0;

export function inferSourceType(domain: string, url: string): SourceType {
  const d = domain.toLowerCase();
  if (/\.gov(\.|$)|nasa\.gov|nih\.gov|cdc\.gov/.test(d)) return "government";
  if (/\.edu(\.|$)|\.ac\.|nature\.com|science\.org|pubmed|arxiv/.test(d + url)) return "academic";
  if (/reddit\.com|quora\.com|stackexchange|stackoverflow/.test(d)) return "forum";
  if (/twitter\.com|x\.com|facebook\.com|instagram\.com|tiktok\.com/.test(d)) return "social";
  if (/bbc\.|cnn\.|reuters|apnews|nytimes|theguardian|news\./.test(d)) return "news";
  if (/blog|medium\.com|substack|wordpress/.test(d + url)) return "blog";
  if (/\.org(\.|$)|who\.int|un\.org/.test(d)) return "organization";
  return "unknown";
}

export function normalizeResults(items: SearchResultItem[], opts?: { queryIndex?: number }): Source[] {
  return items.map((r) => {
    const url = (r.url ?? "").trim();
    const domain = domainOf(url);
    const sourceType = r.sourceType ?? inferSourceType(domain, url);
    const id = `source-${(opts?.queryIndex ?? 0) * 100 + (++counter)}`;
    const snippet = r.snippet?.slice(0, 800);
    const content = r.content ? stripBoilerplate(r.content) : snippet ? stripBoilerplate(snippet) : undefined;
    return {
      id,
      title: (r.title ?? "Untitled").slice(0, 300),
      url,
      domain,
      author: r.author,
      publishedAt: r.publishedAt,
      snippet,
      content,
      sourceType,
      accessStatus: "ok" as const,
      ...(r.isFactCheck ? { isFactCheck: true as const } : {}),
    };
  }).filter((s) => /^https?:\/\//i.test(s.url));
}

const AUTHORITY_SCORE: Record<SourceType, number> = {
  government: 5,
  academic: 5,
  organization: 3,
  news: 3,
  blog: 1,
  forum: 0,
  social: 0,
  unknown: 1,
};

export function deduplicateSources(sources: Source[]): Source[] {
  const seenUrl = new Set<string>();
  const out: Source[] = [];
  for (const s of sources) {
    const canon = canonicalizeUrl(s.url);
    if (seenUrl.has(canon)) continue;
    // Title + content near-duplicate check
    const dup = out.some(
      (o) =>
        o.domain === s.domain &&
        (jaccardSimilarity(o.title, s.title) > 0.85 ||
          ((o.content ?? o.snippet ?? "") &&
            (s.content ?? s.snippet ?? "") &&
            jaccardSimilarity(o.content ?? o.snippet ?? "", s.content ?? s.snippet ?? "") > 0.9))
    );
    if (dup) continue;
    seenUrl.add(canon);
    out.push(s);
  }
  return out;
}

export function rankSources(sources: Source[], opts?: { primaryBoost?: boolean }): Source[] {
  // Authority first, then diversity of sourceType, deterministic tie-break on url.
  // Extended mode boosts academic/government (primary-source discovery).
  const typeSeen = new Set<string>();
  const withScore = sources.map((s) => {
    let score = AUTHORITY_SCORE[s.sourceType] ?? 1;
    if (!typeSeen.has(s.sourceType)) score += 2; // diversity bonus for first of each type
    if (opts?.primaryBoost && (s.sourceType === "academic" || s.sourceType === "government")) score += 2;
    typeSeen.add(s.sourceType);
    return { s, score };
  });
  withScore.sort((a, b) => b.score - a.score || a.s.url.localeCompare(b.s.url));
  return withScore.map((w) => w.s);
}

export function labelQuality(s: Source): QualityLabel {
  const body = `${s.content ?? ""} ${s.snippet ?? ""}`;
  if (s.accessStatus === "unreachable") return "Weak source";
  if (s.accessStatus === "archived_fallback") return "Limited evidence";
  // Dated sources are flagged honestly instead of presented as current.
  if (s.publishedAt) {
    const t = Date.parse(s.publishedAt);
    if (!Number.isNaN(t) && Date.now() - t > 3 * 365 * 24 * 3600 * 1000) return "Outdated";
  }
  if (s.sourceType === "academic" || s.sourceType === "government") {
    if (body.length > 300) return "High confidence";
    return "Good evidence";
  }
  if (s.sourceType === "news" || s.sourceType === "organization") {
    if (body.length > 300) return "Good evidence";
    return "Limited evidence";
  }
  if (s.sourceType === "blog" || s.sourceType === "forum" || s.sourceType === "social" || s.sourceType === "unknown") {
    return "Weak source";
  }
  return "Limited evidence";
}

export function withQuality(sources: Source[]): Source[] {
  return sources.map((s) => ({ ...s, quality: labelQuality(s) }));
}

export function resetSourceCounter(): void {
  counter = 0;
}
