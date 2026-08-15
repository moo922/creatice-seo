import type { AutomationFrequency, AutomationOperation, AutomationOperationSettingsDto } from '@creative-seo/types';
import { AUTOMATION_OPERATIONS } from '@creative-seo/types';

/**
 * Definitions for the recurring platform operations. The scheduler executes
 * these per site from the per-site automation settings. All scheduled work is
 * read-only with respect to published WordPress content: analysis, audits,
 * observations and reports create platform state (issues, recommendations,
 * snapshots, suggestions, reports) but never modify or publish client content.
 */

export interface AutomationDefinition {
  key: AutomationOperation;
  label: string;
  description: string;
  defaultFrequency: AutomationFrequency;
  /** 0 = Sunday .. 6 = Saturday (JS convention). */
  defaultWeekday: number;
  defaultDayOfMonth: number;
  /** `HH:MM` 24-hour, in the site timezone. */
  defaultTime: string;
  /** Requires a connected GSC property to run; otherwise the run is SKIPPED. */
  requiresGsc: boolean;
  /** Expensive operations are never auto-repeated within a period. */
  expensive: boolean;
}

export const AUTOMATION_QUEUE = 'automation';

export const AUTOMATION_DEFINITIONS: readonly AutomationDefinition[] = [
  {
    key: 'gsc-sync',
    label: 'GSC Sync',
    description: 'Incremental Search Console performance sync (daily).',
    defaultFrequency: 'daily',
    defaultWeekday: 0,
    defaultDayOfMonth: 1,
    defaultTime: '06:00',
    requiresGsc: true,
    expensive: false,
  },
  {
    key: 'technical-health',
    label: 'Technical Health Check',
    description: 'Technical/internal-link health analysis (daily or configurable).',
    defaultFrequency: 'daily',
    defaultWeekday: 0,
    defaultDayOfMonth: 1,
    defaultTime: '07:00',
    requiresGsc: false,
    expensive: false,
  },
  {
    key: 'full-crawl',
    label: 'Full Crawl',
    description: 'Recrawl the site and refresh crawled-page signals (weekly).',
    defaultFrequency: 'weekly',
    defaultWeekday: 1,
    defaultDayOfMonth: 1,
    defaultTime: '03:00',
    requiresGsc: false,
    expensive: true,
  },
  {
    key: 'seo-audit',
    label: 'SEO / AEO / GEO Audit',
    description: 'Keyword pipeline plus AI visibility observation (weekly or configurable).',
    defaultFrequency: 'weekly',
    defaultWeekday: 1,
    defaultDayOfMonth: 1,
    defaultTime: '05:00',
    requiresGsc: false,
    expensive: true,
  },
  {
    key: 'keyword-opportunities',
    label: 'Keyword Opportunity Detection',
    description: 'Ingest top GSC queries and refresh keyword opportunities (weekly).',
    defaultFrequency: 'weekly',
    defaultWeekday: 1,
    defaultDayOfMonth: 1,
    defaultTime: '08:00',
    requiresGsc: false,
    expensive: false,
  },
  {
    key: 'internal-link-audit',
    label: 'Internal Link Audit',
    description: 'Internal-link graph analysis and suggestions (weekly).',
    defaultFrequency: 'weekly',
    defaultWeekday: 2,
    defaultDayOfMonth: 1,
    defaultTime: '04:00',
    requiresGsc: false,
    expensive: false,
  },
  {
    key: 'content-decay',
    label: 'Content Decay Analysis',
    description: 'Detect pages losing organic clicks and raise alerts (weekly).',
    defaultFrequency: 'weekly',
    defaultWeekday: 3,
    defaultDayOfMonth: 1,
    defaultTime: '06:00',
    requiresGsc: true,
    expensive: false,
  },
  {
    key: 'ai-visibility',
    label: 'AI Visibility Observation',
    description: 'Run AI visibility observations across the prompt set (weekly or configurable).',
    defaultFrequency: 'weekly',
    defaultWeekday: 4,
    defaultDayOfMonth: 1,
    defaultTime: '05:00',
    requiresGsc: false,
    expensive: true,
  },
  {
    key: 'monthly-snapshot',
    label: 'Monthly Snapshot',
    description: 'Capture an immutable monthly performance snapshot (monthly).',
    defaultFrequency: 'monthly',
    defaultWeekday: 0,
    defaultDayOfMonth: 1,
    defaultTime: '06:00',
    requiresGsc: false,
    expensive: true,
  },
  {
    key: 'client-report',
    label: 'Client Report',
    description: 'Generate the monthly client report (monthly).',
    defaultFrequency: 'monthly',
    defaultWeekday: 0,
    defaultDayOfMonth: 1,
    defaultTime: '08:00',
    requiresGsc: false,
    expensive: true,
  },
];

export const AUTOMATION_DEFINITION_BY_KEY: Record<AutomationOperation, AutomationDefinition> = Object.fromEntries(
  AUTOMATION_DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<AutomationOperation, AutomationDefinition>;

/**
 * Platform auto-behavior flags. Scheduled jobs honor these for what they are
 * allowed to do (analyze, detect issues, generate recommendations). Content
 * generation/publishing/apply-fixes stay OFF by default and scheduled jobs never
 * modify published WordPress content regardless of the flags.
 */
export interface AutomationFlags {
  autoAnalyze: boolean;
  autoDetectIssues: boolean;
  autoGenerateRecommendations: boolean;
  autoGenerateContent: boolean;
  autoPublish: boolean;
  autoApplyFixes: boolean;
}

export const DEFAULT_AUTOMATION_FLAGS: AutomationFlags = {
  autoAnalyze: true,
  autoDetectIssues: true,
  autoGenerateRecommendations: true,
  autoGenerateContent: false,
  autoPublish: false,
  autoApplyFixes: false,
};

export function defaultOperationSettings(definition: AutomationDefinition): AutomationOperationSettingsDto {
  return {
    enabled: true,
    frequency: definition.defaultFrequency,
    weekday: definition.defaultWeekday,
    dayOfMonth: definition.defaultDayOfMonth,
    time: definition.defaultTime,
  };
}

export function defaultAutomationOperations(): Record<AutomationOperation, AutomationOperationSettingsDto> {
  return Object.fromEntries(
    AUTOMATION_OPERATIONS.map((key) => [key, defaultOperationSettings(AUTOMATION_DEFINITION_BY_KEY[key])]),
  ) as Record<AutomationOperation, AutomationOperationSettingsDto>;
}
