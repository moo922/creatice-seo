/**
 * Client reporting with methodology note (GC06 Sections 55-57).
 * Every report must include:
 * - Observation period
 * - Prompt set version
 * - Providers
 * - Methodology version
 * - Data quality
 * - Methodology note
 */

export interface MethodologyNote {
  observationPeriod: { start: string; end: string };
  promptSetVersion: number;
  providers: string[];
  models: string[];
  methodologyVersion: string;
  dataQuality: string;
  note: string;
  warning: string | null;
}

export function generateMethodologyNote(config: {
  periodStart: string;
  periodEnd: string;
  promptSetVersion: number;
  providers: string[];
  models: string[];
  methodologyVersion: string;
  dataQuality: string;
  methodologyChanged?: boolean;
  previousMethodology?: string;
}): MethodologyNote {
  const providerList = config.providers.join(', ');
  const modelList = config.models.join(', ');

  let note = `This report contains controlled observations from ${providerList} (${modelList}).`;
  note += ` Measured with standardized prompts (Prompt Set v${config.promptSetVersion}).`;
  note += ` Methodology: ${config.methodologyVersion}.`;
  note += ` Not an exact AI ranking.`;

  let warning: string | null = null;
  if (config.methodologyChanged) {
    warning = `Methodology changed between periods (from ${config.previousMethodology ?? 'unknown'} to ${config.methodologyVersion}). Comparison quality downgraded.`;
    note += ` WARNING: ${warning}`;
  }

  if (config.dataQuality !== 'GOOD') {
    note += ` Data quality: ${config.dataQuality}.`;
  }

  return {
    observationPeriod: { start: config.periodStart, end: config.periodEnd },
    promptSetVersion: config.promptSetVersion,
    providers: config.providers,
    models: config.models,
    methodologyVersion: config.methodologyVersion,
    dataQuality: config.dataQuality,
    note,
    warning,
  };
}

export function generateProviderSummary(providers: Array<{
  provider: string;
  model: string;
  promptsTested: number;
  successful: number;
  brandMentionRate: number;
  verifiedCitationRate: number | null;
  citationSupported: boolean;
}>): string[] {
  return providers.map((p) => {
    const citationLine = p.citationSupported
      ? `Verified Citation: ${(p.verifiedCitationRate ?? 0) * 100}%`
      : 'Verified Citation: Not Measured (provider lacks citation capability)';

    return [
      `${p.provider} (${p.model})`,
      `Prompts Tested: ${p.promptsTested}`,
      `Successful: ${p.successful}`,
      `Brand Mention: ${p.brandMentionRate * 100}%`,
      citationLine,
    ].join(' | ');
  });
}
