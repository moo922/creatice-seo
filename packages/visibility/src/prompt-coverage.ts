/**
 * Prompt coverage tracking (GC06 Section 34). Tracks whether each strategic
 * prompt has been tested across providers/models. Displays missing observations.
 */

export interface PromptCoverageByProvider {
  provider: string;
  tested: number;
  successful: number;
}

export interface PromptCoverageByCategory {
  category: string;
  tested: number;
  successful: number;
}

export interface MissingPrompt {
  promptId: string;
  text: string;
  category: string;
}

export interface PromptCoverage {
  totalPrompts: number;
  testedPrompts: number;
  coverage: number;
  byProvider: PromptCoverageByProvider[];
  byCategory: PromptCoverageByCategory[];
  missingPrompts: MissingPrompt[];
}

export interface PromptCoverageInput {
  promptId: string;
  text: string;
  category: string;
  provider: string;
  status: string;
}

export function computePromptCoverage(
  allPrompts: Array<{ id: string; text: string; category: string }>,
  observations: PromptCoverageInput[],
): PromptCoverage {
  const totalPrompts = allPrompts.length;

  const testedByPrompt = new Map<string, Set<string>>();
  const successfulByPrompt = new Map<string, Set<string>>();
  const byProvider = new Map<string, { tested: number; successful: number }>();
  const byCategory = new Map<string, { tested: number; successful: number }>();

  for (const obs of observations) {
    if (!testedByPrompt.has(obs.promptId)) {
      testedByPrompt.set(obs.promptId, new Set());
    }
    testedByPrompt.get(obs.promptId)!.add(obs.provider);

    if (obs.status === 'SUCCESS') {
      if (!successfulByPrompt.has(obs.promptId)) {
        successfulByPrompt.set(obs.promptId, new Set());
      }
      successfulByPrompt.get(obs.promptId)!.add(obs.provider);
    }

    const provEntry = byProvider.get(obs.provider) ?? { tested: 0, successful: 0 };
    provEntry.tested++;
    if (obs.status === 'SUCCESS') provEntry.successful++;
    byProvider.set(obs.provider, provEntry);

    const catEntry = byCategory.get(obs.category) ?? { tested: 0, successful: 0 };
    catEntry.tested++;
    if (obs.status === 'SUCCESS') catEntry.successful++;
    byCategory.set(obs.category, catEntry);
  }

  const testedPrompts = testedByPrompt.size;
  const missingPrompts = allPrompts
    .filter((p) => !testedByPrompt.has(p.id))
    .map((p) => ({ promptId: p.id, text: p.text, category: p.category }));

  return {
    totalPrompts,
    testedPrompts,
    coverage: totalPrompts > 0 ? Math.round((testedPrompts / totalPrompts) * 10000) / 10000 : 0,
    byProvider: [...byProvider.entries()].map(([provider, data]) => ({ provider, ...data })),
    byCategory: [...byCategory.entries()].map(([category, data]) => ({ category, ...data })),
    missingPrompts,
  };
}
