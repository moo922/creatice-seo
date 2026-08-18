/**
 * Contamination protection (GC06 Section 39). For non-branded prompts:
 * - Do NOT pass the site Knowledge Base to the test model
 * - Do NOT pass GEO audit findings
 * - Do NOT pass AEO audit findings
 * - Log that KB was withheld
 */

export interface ContaminationProtectionConfig {
  /** Whether to withhold KB from the test model */
  withholdKB: boolean;
  /** Whether to withhold GEO findings */
  withholdGeoFindings: boolean;
  /** Whether to withhold AEO findings */
  withholdAeoFindings: boolean;
}

export interface ContaminationProtectionResult {
  config: ContaminationProtectionConfig;
  logged: boolean;
  /** What was explicitly withheld */
  withheldItems: string[];
}

/**
 * Determine contamination protection for a given prompt.
 * Branded prompts may contain the brand name.
 * Non-branded prompts must NOT receive KB, GEO, or AEO context.
 */
export function applyContaminationProtection(
  promptText: string,
  targetBrand: string,
  options: { includeKB?: boolean; includeGeo?: boolean; includeAeo?: boolean } = {},
): ContaminationProtectionResult {
  const isBranded = isBrandedPrompt(promptText, targetBrand);

  const config: ContaminationProtectionConfig = {
    withholdKB: !isBranded && (options.includeKB ?? true),
    withholdGeoFindings: !isBranded && (options.includeGeo ?? true),
    withholdAeoFindings: !isBranded && (options.includeAeo ?? true),
  };

  const withheldItems: string[] = [];
  if (config.withholdKB) withheldItems.push('knowledge_base');
  if (config.withholdGeoFindings) withheldItems.push('geo_findings');
  if (config.withholdAeoFindings) withheldItems.push('aeo_findings');

  return {
    config,
    logged: withheldItems.length > 0,
    withheldItems,
  };
}

function isBrandedPrompt(promptText: string, targetBrand: string): boolean {
  if (!targetBrand) return false;
  const lower = promptText.toLowerCase();
  const brandLower = targetBrand.toLowerCase();
  return lower.includes(brandLower) || lower.includes(brandLower.split(' ')[0] ?? '');
}
