import { issueProgression } from './baseline';
import type { IssueSnapshotEntry } from '@creative-seo/types';

describe('Issue progress', () => {
  it('issue created->resolved->reopened shows correct period metrics', () => {
    // Period start: issue 'x' was DETECTED (open)
    const periodStart: IssueSnapshotEntry[] = [
      { id: 'x', status: 'DETECTED' },
    ];

    // Period end: issue 'x' was RESOLVED then REOPENED (back to DETECTED)
    const periodEnd: IssueSnapshotEntry[] = [
      { id: 'x', status: 'DETECTED' },
    ];

    // Since 'x' was open in both snapshots, it's "remaining"
    const progression = issueProgression(periodStart, periodEnd);
    expect(progression.initial).toBe(1);
    expect(progression.new).toBe(0);
    expect(progression.resolved).toBe(0);
    expect(progression.remaining).toBe(1);
    expect(progression.regressed).toBe(0);
    expect(progression.totalOpen).toBe(1);
  });

  it('issue detected->resolved is counted as resolved', () => {
    const prev: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
    ];
    const curr: IssueSnapshotEntry[] = [
      { id: 'a', status: 'RESOLVED' },
    ];

    const progression = issueProgression(prev, curr);
    expect(progression.initial).toBe(1);
    expect(progression.resolved).toBe(1);
    expect(progression.remaining).toBe(0);
    expect(progression.totalOpen).toBe(0);
  });

  it('issue resolved->detected is counted as regressed', () => {
    const prev: IssueSnapshotEntry[] = [
      { id: 'a', status: 'RESOLVED' },
    ];
    const curr: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
    ];

    const progression = issueProgression(prev, curr);
    expect(progression.initial).toBe(1);
    expect(progression.regressed).toBe(1);
    expect(progression.remaining).toBe(0);
    expect(progression.totalOpen).toBe(1);
  });

  it('mixed lifecycle: 3 issues across created/resolved/regressed', () => {
    const prev: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
      { id: 'b', status: 'RESOLVED' },
      { id: 'c', status: 'IN_PROGRESS' },
    ];
    const curr: IssueSnapshotEntry[] = [
      { id: 'a', status: 'RESOLVED' },    // detected -> resolved = resolved
      { id: 'b', status: 'DETECTED' },    // resolved -> detected = regressed
      { id: 'c', status: 'IN_PROGRESS' }, // still open = remaining
      { id: 'd', status: 'DETECTED' },    // new issue
    ];

    const progression = issueProgression(prev, curr);
    expect(progression.initial).toBe(3);
    expect(progression.new).toBe(1);
    expect(progression.resolved).toBe(1);
    expect(progression.regressed).toBe(1);
    expect(progression.remaining).toBe(1);
    expect(progression.totalOpen).toBe(3); // c, b(reopened), d
  });

  it('empty previous means all issues are new', () => {
    const prev: IssueSnapshotEntry[] = [];
    const curr: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
      { id: 'b', status: 'DETECTED' },
    ];

    const progression = issueProgression(prev, curr);
    expect(progression.initial).toBe(0);
    expect(progression.new).toBe(2);
    expect(progression.resolved).toBe(0);
    expect(progression.remaining).toBe(0);
    expect(progression.totalOpen).toBe(2);
  });

  it('empty current means all issues resolved', () => {
    const prev: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
      { id: 'b', status: 'IN_PROGRESS' },
    ];
    const curr: IssueSnapshotEntry[] = [];

    const progression = issueProgression(prev, curr);
    expect(progression.initial).toBe(2);
    expect(progression.new).toBe(0);
    expect(progression.resolved).toBe(0);
    expect(progression.remaining).toBe(0);
    expect(progression.totalOpen).toBe(0);
  });

  it('IGNORED status is treated as closed', () => {
    const prev: IssueSnapshotEntry[] = [
      { id: 'a', status: 'DETECTED' },
    ];
    const curr: IssueSnapshotEntry[] = [
      { id: 'a', status: 'IGNORED' },
    ];

    const progression = issueProgression(prev, curr);
    expect(progression.resolved).toBe(1);
    expect(progression.totalOpen).toBe(0);
  });
});
