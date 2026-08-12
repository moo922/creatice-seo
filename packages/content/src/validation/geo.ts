import type { ValidatorResultDto } from '@creative-seo/types';
import { stripHtml } from '../arabic';
import { metric, validatorResult } from './common';

export interface GeoEntity {
  name: string;
  type: string;
  description: string;
}

export interface GeoInput {
  html: string;
  language: 'ar' | 'en';
  entities: GeoEntity[];
  keyFacts: string[];
  originalInsights: string[];
  attributionNeeds: string[];
  externalSources: Array<{ title: string; url: string }>;
  verifiedFactsCount: number;
  hasJsonLd: boolean;
}

/**
 * Generative-engine optimization validator using INTERNAL platform criteria
 * only (entity clarity, fact consistency, source quality, citation readiness,
 * original information, expert attribution, machine readability). These are
 * internal scores, not official search-engine scores.
 */
export function deterministicGeoCheck(input: GeoInput): ValidatorResultDto {
  const plain = stripHtml(input.html);
  const normalized = plain.toLocaleLowerCase(input.language === 'ar' ? 'ar' : 'en');

  const entityClarity = input.entities.length > 0 ? Math.min(100, input.entities.length * 20) : 20;
  const factConsistency = input.verifiedFactsCount > 0 ? Math.min(100, 60 + input.verifiedFactsCount * 10) : 30;
  const sourceQuality = scoreByUrlQuality(input.externalSources);
  const citationReadiness = input.externalSources.length > 0 ? Math.min(100, 40 + input.externalSources.length * 15) : 20;
  const originalInformation = input.originalInsights.length > 0 ? Math.min(100, 40 + input.originalInsights.length * 15) : 20;
  const expertAttribution = scoreExpertAttribution(input.attributionNeeds, normalized, input.language);
  const machineReadable = scoreMachineReadable(input.hasJsonLd, input.html);

  const recommendations: string[] = [];
  if (entityClarity < 60) recommendations.push('Make entities explicit (define who/what the page is about).');
  if (factConsistency < 60) recommendations.push('Ground claims in verified facts and reconcile contradictions.');
  if (sourceQuality < 60) recommendations.push('Prefer reputable, first-party sources with stable URLs.');
  if (citationReadiness < 60) recommendations.push('Add citations with titles and URLs for key facts.');
  if (originalInformation < 60) recommendations.push('Add original data, examples or analysis unique to this page.');
  if (expertAttribution < 60) recommendations.push('Attribute claims to named experts or authoritative authors.');
  if (machineReadable < 60) recommendations.push('Add structured data and semantic HTML (headings, lists, tables).');

  return validatorResult(
    'GEO',
    'GEO validator',
    [
      metric('geo.entity.clarity', 'Entity clarity', entityClarity, { weight: 2, details: `${input.entities.length} entities` }),
      metric('geo.fact.consistency', 'Fact consistency', factConsistency, { weight: 2 }),
      metric('geo.source.quality', 'Source quality', sourceQuality, { weight: 2 }),
      metric('geo.citation.ready', 'Citation readiness', citationReadiness, { weight: 2 }),
      metric('geo.original.info', 'Original information', originalInformation, { weight: 1 }),
      metric('geo.expert.attribution', 'Expert attribution', expertAttribution, { weight: 1 }),
      metric('geo.machine.readable', 'Machine readability', machineReadable, { weight: 2 }),
    ],
    recommendations,
    'Internal GEO score based on platform-defined criteria; not an official search-engine score.',
  );
}

function scoreByUrlQuality(sources: Array<{ title: string; url: string }>): number {
  if (sources.length === 0) return 20;
  const authoritative = sources.filter((source) => {
    try {
      const host = new URL(source.url).hostname;
      return !/(forum|reddit|fandom|quora|blogspot|wordpress\.com)/i.test(host);
    } catch {
      return false;
    }
  }).length;
  return Math.min(100, 40 + (authoritative / sources.length) * 60);
}

function scoreExpertAttribution(needs: string[], normalizedBody: string, language: 'ar' | 'en'): number {
  if (needs.length === 0) return 80;
  const attributed = needs.filter((need) => {
    const needle = need.toLocaleLowerCase(language === 'ar' ? 'ar' : 'en').slice(0, 48);
    return needle.length === 0 || normalizedBody.includes(needle);
  }).length;
  return Math.round((attributed / needs.length) * 100);
}

function scoreMachineReadable(hasJsonLd: boolean, html: string): number {
  let score = hasJsonLd ? 60 : 30;
  score += /<(h1|h2|h3)/i.test(html) ? 10 : 0;
  score += /<(ul|ol|table)/i.test(html) ? 10 : 0;
  score += /<(p|article|section)/i.test(html) ? 10 : 0;
  score += /<meta/i.test(html) ? 10 : 0;
  return Math.min(100, score);
}
