import type { ValidatorResultDto } from '@creative-seo/types';
import { metric, validatorResult } from './common';

export type FactStatus = 'VERIFIED' | 'UNVERIFIED' | 'CONTRADICTED';

export interface FactClaim {
  claim: string;
  status: FactStatus;
  sourceUrl: string | null;
  evidence: string | null;
}

export interface FactualInput {
  claims: FactClaim[];
  /** Verified facts supplied to the pipeline that the draft should reference. */
  verifiedFactsCount: number;
  /** Claims from the draft that could not be tied to any verified fact or source. */
  unverifiableCount: number;
}

/**
 * Factual validator. Cross-checks draft claims against verified facts and
 * evidence sources. Contradicted claims are blocking; unverifiable claims are
 * warnings, never silently removed (removing information is worse than flagging
 * it for a human).
 */
export function deterministicFactualCheck(input: FactualInput): ValidatorResultDto {
  const claims = input.claims;
  const verified = claims.filter((claim) => claim.status === 'VERIFIED').length;
  const contradicted = claims.filter((claim) => claim.status === 'CONTRADICTED').length;
  const unverified = claims.filter((claim) => claim.status === 'UNVERIFIED').length;

  const consistency = claims.length === 0 ? 100 : Math.round((verified / claims.length) * 100);
  const sourceTraceability = claims.length === 0 ? 100 : Math.round(((verified + unverified) / claims.length) * 100);
  const noContradictions = contradicted === 0 ? 100 : Math.max(0, 100 - contradicted * 40);
  const factUsage = input.verifiedFactsCount === 0 ? 100 : Math.max(0, 100 - input.unverifiableCount * 15);

  const recommendations: string[] = [];
  if (contradicted > 0) recommendations.push(`Remove or correct ${contradicted} contradicted claim(s).`);
  if (unverified > 0) recommendations.push(`${unverified} claim(s) lack a source; verify or cite them.`);
  if (input.unverifiableCount > 0) recommendations.push('Tie claims to supplied verified facts where possible.');

  return validatorResult(
    'FACTUAL',
    'Factual validator',
    [
      metric('factual.consistency', 'Claim-to-source consistency', consistency, { weight: 2 }),
      metric('factual.traceability', 'Claims traceable to sources', sourceTraceability, { weight: 2 }),
      metric('factual.no.contradictions', 'No contradicted claims', noContradictions, { weight: 3 }),
      metric('factual.verified.usage', 'Verified facts used', factUsage, { weight: 1 }),
    ],
    recommendations,
  );
}

export function factualBlocked(claims: FactClaim[]): boolean {
  return claims.some((claim) => claim.status === 'CONTRADICTED');
}
