/**
 * Competitive share of voice (GC06 Sections 31-33).
 * Calculates mention share and citation share across entities.
 * Always labelled as "Controlled Observation — not market share".
 */

export interface CompetitorShareEntry {
  competitorId: string;
  name: string;
  mentionCount: number;
  citationCount: number;
  mentionShare: number;
  citationShare: number;
}

export interface CompetitiveShareOfVoice {
  mentionShare: {
    target: number;
    total: number;
    competitors: CompetitorShareEntry[];
  };
  citationShare: {
    target: number;
    total: number;
    competitors: CompetitorShareEntry[];
  };
  denominator: number;
  methodologyNote: string;
}

export interface ObservationShareInput {
  brandMentioned: boolean;
  verifiedTargetCitation: boolean;
  competitorResults: Array<{ name: string; mentioned: boolean }>;
}

export function computeCompetitiveShareOfVoice(
  observations: ObservationShareInput[],
  targetName: string,
  competitors: Array<{ id: string; name: string }>,
): CompetitiveShareOfVoice {
  const denominator = observations.length;

  let targetMentions = 0;
  let targetCitations = 0;
  const competitorMentions = new Map<string, number>();
  const competitorCitations = new Map<string, number>();

  for (const comp of competitors) {
    competitorMentions.set(comp.id, 0);
    competitorCitations.set(comp.id, 0);
  }

  for (const obs of observations) {
    if (obs.brandMentioned) targetMentions++;
    if (obs.verifiedTargetCitation) targetCitations++;

    for (const comp of competitors) {
      const compResult = obs.competitorResults.find((c) => c.name === comp.name);
      if (compResult?.mentioned) {
        competitorMentions.set(comp.id, (competitorMentions.get(comp.id) ?? 0) + 1);
      }
    }
  }

  const totalMentions = targetMentions + [...competitorMentions.values()].reduce((a, b) => a + b, 0);
  const totalCitations = targetCitations + [...competitorCitations.values()].reduce((a, b) => a + b, 0);

  return {
    mentionShare: {
      target: denominator > 0 ? Math.round((targetMentions / denominator) * 10000) / 10000 : 0,
      total: totalMentions,
      competitors: competitors.map((comp) => ({
        competitorId: comp.id,
        name: comp.name,
        mentionCount: competitorMentions.get(comp.id) ?? 0,
        citationCount: competitorCitations.get(comp.id) ?? 0,
        mentionShare: denominator > 0 ? Math.round(((competitorMentions.get(comp.id) ?? 0) / denominator) * 10000) / 10000 : 0,
        citationShare: denominator > 0 ? Math.round(((competitorCitations.get(comp.id) ?? 0) / denominator) * 10000) / 10000 : 0,
      })),
    },
    citationShare: {
      target: denominator > 0 ? Math.round((targetCitations / denominator) * 10000) / 10000 : 0,
      total: totalCitations,
      competitors: competitors.map((comp) => ({
        competitorId: comp.id,
        name: comp.name,
        mentionCount: competitorMentions.get(comp.id) ?? 0,
        citationCount: competitorCitations.get(comp.id) ?? 0,
        mentionShare: denominator > 0 ? Math.round(((competitorMentions.get(comp.id) ?? 0) / denominator) * 10000) / 10000 : 0,
        citationShare: denominator > 0 ? Math.round(((competitorCitations.get(comp.id) ?? 0) / denominator) * 10000) / 10000 : 0,
      })),
    },
    denominator,
    methodologyNote: `AI Share of Voice — Controlled Observation. Based on ${denominator} observations from standardized prompts. Not market share.`,
  };
}
