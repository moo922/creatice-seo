import type {
  AutomationOperation,
  AutomationOperationSettingsDto,
  AutomationFrequency,
  SiteAutomationSettingsDto,
} from '@creative-seo/types';
import { AUTOMATION_OPERATIONS } from '@creative-seo/types';
import { AUTOMATION_DEFINITION_BY_KEY, DEFAULT_AUTOMATION_FLAGS, defaultAutomationOperations, type AutomationFlags } from './definitions';

const FREQUENCIES: readonly AutomationFrequency[] = ['daily', 'weekly', 'monthly'];

/**
 * Normalization of per-site automation settings. `operations` is always stored
 * as a complete record over all operations (missing entries take defaults) and
 * `defaults` always carries all six auto-behavior flags, so the persisted shape
 * is stable regardless of which fields the client sends.
 */

export function normalizeOperationSettings(input: Partial<AutomationOperationSettingsDto>, operation: AutomationOperation): AutomationOperationSettingsDto {
  const definition = AUTOMATION_DEFINITION_BY_KEY[operation];
  const base = definition.defaultFrequency;
  const frequency: AutomationFrequency = FREQUENCIES.includes(input.frequency as AutomationFrequency)
    ? (input.frequency as AutomationFrequency)
    : base;

  const normalized: AutomationOperationSettingsDto = {
    enabled: input.enabled ?? true,
    frequency,
    time: typeof input.time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(input.time) ? input.time : definition.defaultTime,
  };
  if (frequency === 'weekly') {
    const weekday = Number(input.weekday);
    normalized.weekday = Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : definition.defaultWeekday;
  } else if (frequency === 'monthly') {
    const dayOfMonth = Number(input.dayOfMonth);
    normalized.dayOfMonth = Number.isInteger(dayOfMonth) && dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : definition.defaultDayOfMonth;
  } else {
    normalized.weekday = definition.defaultWeekday;
    normalized.dayOfMonth = definition.defaultDayOfMonth;
  }
  return normalized;
}

export function normalizeOperations(input: Record<string, unknown> | undefined): Record<AutomationOperation, AutomationOperationSettingsDto> {
  const defaults = defaultAutomationOperations();
  for (const operation of AUTOMATION_OPERATIONS) {
    const entry = input?.[operation];
    if (entry && typeof entry === 'object') {
      defaults[operation] = normalizeOperationSettings(entry as Partial<AutomationOperationSettingsDto>, operation);
    }
  }
  return defaults;
}

export function normalizeFlags(input: Record<string, unknown> | undefined): AutomationFlags {
  const flags = { ...DEFAULT_AUTOMATION_FLAGS };
  for (const key of Object.keys(DEFAULT_AUTOMATION_FLAGS)) {
    if (typeof input?.[key] === 'boolean') {
      flags[key as keyof AutomationFlags] = input[key] as boolean;
    }
  }
  return flags;
}

export function toSettingsDto(
  siteId: string,
  row: { enabled: boolean; timezone: string; operations: Record<string, unknown> | null; defaults: Record<string, unknown> | null; updatedAt: Date },
): SiteAutomationSettingsDto {
  return {
    siteId,
    enabled: row.enabled,
    timezone: row.timezone || 'UTC',
    operations: normalizeOperations(row.operations ?? {}),
    defaults: normalizeFlags(row.defaults ?? {}),
    updatedAt: row.updatedAt.toISOString(),
  };
}
