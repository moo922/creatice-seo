/**
 * Entity alias normalization (GC06 Section 16). Resolves Arabic names,
 * English names, abbreviations, legal names, brand names, and domains
 * to a single canonical entity. Prevents double-counting.
 */

export interface EntityAlias {
  canonicalId: string;
  canonicalName: string;
  aliases: string[];
  domain: string | null;
}

export interface NormalizedEntityMatch {
  canonicalId: string;
  canonicalName: string;
  matchedAlias: string;
  matchType: 'exact' | 'partial' | 'domain' | 'abbreviation';
  confidence: number;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ').trim();
}

function normalizeArabic(text: string): string {
  return text
    .replace(/[ًٌٍَُِّْ]/g, '') // Remove tashkeel
    .replace(/ة/g, 'ه') // Ta marbuta -> ha
    .replace(/ى/g, 'ي') // Alef maqsura -> ya
    .replace(/ؤ/g, 'و') // Hamza on waw -> waw
    .replace(/ئ/g, 'ي') // Hamza on ya -> ya
    .toLowerCase()
    .replace(/[\s\u200B-\u200D\uFEFF]+/g, ' ')
    .trim();
}



function hostMatchesDomain(host: string, domain: string): boolean {
  const normHost = host.replace(/^www\./, '').toLowerCase();
  const normDomain = domain.replace(/^www\./, '').toLowerCase();
  return normHost === normDomain || normHost.endsWith(`.${normDomain}`);
}

export function resolveEntity(
  text: string,
  entities: EntityAlias[],
): NormalizedEntityMatch | null {
  const normalized = normalize(text);
  const arabicNormalized = normalizeArabic(text);

  let bestMatch: NormalizedEntityMatch | null = null;

  for (const entity of entities) {
    const allAliases = [entity.canonicalName, ...entity.aliases];

    for (const alias of allAliases) {
      const normAlias = normalize(alias);
      const arabicAlias = normalizeArabic(alias);

      if (normAlias.length >= 3 && (normalized.includes(normAlias) || arabicNormalized.includes(arabicAlias))) {
        const confidence = normAlias.length >= 5 ? 0.95 : 0.8;
        const matchType: NormalizedEntityMatch['matchType'] = normAlias === normalized ? 'exact' : 'partial';
        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = {
            canonicalId: entity.canonicalId,
            canonicalName: entity.canonicalName,
            matchedAlias: alias,
            matchType,
            confidence,
          };
        }
      }
    }

    if (entity.domain) {
      const hosts = text.match(/https?:\/\/[^\s<>"]+/g) ?? [];
      for (const url of hosts) {
        try {
          const host = new URL(url).hostname;
          if (hostMatchesDomain(host, entity.domain)) {
            const confidence = 0.95;
            if (!bestMatch || confidence > bestMatch.confidence) {
              bestMatch = {
                canonicalId: entity.canonicalId,
                canonicalName: entity.canonicalName,
                matchedAlias: entity.domain,
                matchType: 'domain',
                confidence,
              };
            }
          }
        } catch { /* ignore malformed URLs */ }
      }
    }
  }

  return bestMatch;
}

export function resolveAllEntities(
  text: string,
  entities: EntityAlias[],
): NormalizedEntityMatch[] {
  const matches: NormalizedEntityMatch[] = [];
  const seen = new Set<string>();

  for (const entity of entities) {
    const match = resolveEntity(text, [entity]);
    if (match && !seen.has(match.canonicalId)) {
      seen.add(match.canonicalId);
      matches.push(match);
    }
  }

  return matches;
}
