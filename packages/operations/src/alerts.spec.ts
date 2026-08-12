import { evaluateAlerts } from './alerts';

describe('evaluateAlerts', () => {
  it('detects a traffic drop above the threshold', () => {
    const alerts = evaluateAlerts({
      gscHealthy: true,
      wordpressHealthy: true,
      traffic: { clicks: 600, prevClicks: 1000 },
    });
    expect(alerts.map((alert) => alert.kind)).toContain('TRAFFIC_DROP');
    expect(alerts.find((alert) => alert.kind === 'TRAFFIC_DROP')?.data.dropPct).toBe(0.4);
  });

  it('does not fire when the drop is below the threshold', () => {
    const alerts = evaluateAlerts({
      gscHealthy: true,
      wordpressHealthy: true,
      traffic: { clicks: 900, prevClicks: 1000 },
    });
    expect(alerts.map((alert) => alert.kind)).not.toContain('TRAFFIC_DROP');
  });

  it('detects CTR drop, position decline and critical technical issues', () => {
    const alerts = evaluateAlerts({
      gscHealthy: true,
      wordpressHealthy: true,
      ctr: { ctr: 0.01, prevCtr: 0.02 },
      position: { avgPosition: 15, prevAvgPosition: 10, keywords: 12 },
      criticalTechnicalIssueCount: 3,
    });
    const kinds = alerts.map((alert) => alert.kind);
    expect(kinds).toEqual(expect.arrayContaining(['CTR_DROP', 'POSITION_DECLINE', 'CRITICAL_TECHNICAL_ISSUE']));
    expect(alerts.find((alert) => alert.kind === 'CRITICAL_TECHNICAL_ISSUE')?.severity).toBe('CRITICAL');
  });

  it('detects GSC and WordPress failures', () => {
    const alerts = evaluateAlerts({ gscHealthy: false, wordpressHealthy: false });
    const kinds = alerts.map((alert) => alert.kind);
    expect(kinds).toEqual(expect.arrayContaining(['GSC_FAILURE', 'WORDPRESS_FAILURE']));
  });

  it('detects content decay and cannibalization', () => {
    const alerts = evaluateAlerts({
      gscHealthy: true,
      wordpressHealthy: true,
      contentDecay: [{ page: '/guide', clicks: 50, prevClicks: 100 }],
      cannibalization: [{ query: 'seo agency', pages: ['/a', '/b', '/c'] }],
    });
    const kinds = alerts.map((alert) => alert.kind);
    expect(kinds).toContain('CONTENT_DECAY');
    expect(kinds).toContain('NEW_CANNIBALIZATION');
  });

  it('skips content decay when the signal is below the threshold', () => {
    const alerts = evaluateAlerts({
      gscHealthy: true,
      wordpressHealthy: true,
      contentDecay: [{ page: '/guide', clicks: 90, prevClicks: 100 }],
    });
    expect(alerts.map((alert) => alert.kind)).not.toContain('CONTENT_DECAY');
  });

  it('respects custom thresholds', () => {
    const alerts = evaluateAlerts(
      { gscHealthy: true, wordpressHealthy: true, traffic: { clicks: 900, prevClicks: 1000 } },
      { trafficDropPct: 0.05 },
    );
    expect(alerts.map((alert) => alert.kind)).toContain('TRAFFIC_DROP');
  });
});
