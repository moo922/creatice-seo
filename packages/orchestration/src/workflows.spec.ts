import { ORCHESTRATION_WORKFLOW_DEFS } from './workflows';

describe('workflow registry', () => {
  it('defines all 15 workflows in order', () => {
    expect(ORCHESTRATION_WORKFLOW_DEFS).toHaveLength(15);
    const keys = ORCHESTRATION_WORKFLOW_DEFS.map((def) => def.key);
    expect(keys).toEqual([
      'site-sync',
      'crawl-audit',
      'gsc-sync',
      'keyword-discovery',
      'keyword-clustering',
      'content-brief',
      'content-generation',
      'content-qa',
      'internal-linking',
      'wp-draft-publisher',
      'post-publish-verification',
      'monitoring-opportunities',
      'ai-visibility-observation',
      'monthly-snapshot',
      'report-generation',
    ]);
  });

  it('has unique keys and sequential order numbers', () => {
    const keys = new Set(ORCHESTRATION_WORKFLOW_DEFS.map((def) => def.key));
    expect(keys.size).toBe(ORCHESTRATION_WORKFLOW_DEFS.length);
    ORCHESTRATION_WORKFLOW_DEFS.forEach((def, index) => expect(def.order).toBe(index + 1));
  });

  it('every workflow has sane defaults', () => {
    for (const def of ORCHESTRATION_WORKFLOW_DEFS) {
      expect(def.maxAttempts).toBeGreaterThan(0);
      expect(def.timeoutMs).toBeGreaterThan(0);
      expect(def.webhookPath).toMatch(/^\//);
    }
  });
});
