import { isPathAllowed, parseRobotsTxt, selectGroup } from './robots';

describe('robots.txt parsing', () => {
  it('parses user-agent groups with allow/disallow', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /wp-admin/\nAllow: /wp-admin/admin-ajax.php');
    expect(rules.groups).toHaveLength(1);
    expect(selectGroup(rules, 'CreativeSEO-Crawler')).not.toBeNull();
  });

  it('respects longest-match precedence (Allow wins over shorter Disallow)', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /private/\nAllow: /private/public/');
    expect(isPathAllowed(rules, 'x', '/private/public/page')).toBe(true);
    expect(isPathAllowed(rules, 'x', '/private/secret')).toBe(false);
  });

  it('allows everything when there are no rules', () => {
    expect(isPathAllowed(parseRobotsTxt(''), 'x', '/anything')).toBe(true);
  });

  it('blocks matching disallow and ignores query/fragment', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /admin');
    expect(isPathAllowed(rules, 'x', '/admin/panel?tab=1#top')).toBe(false);
    expect(isPathAllowed(rules, 'x', '/public')).toBe(true);
  });

  it('selects the exact user-agent group over the wildcard', () => {
    const rules = parseRobotsTxt('User-agent: *\nDisallow: /a\n\nUser-agent: MyBot\nDisallow: /b');
    const group = selectGroup(rules, 'MyBot');
    expect(group?.userAgents).toEqual(['MyBot']);
  });

  it('ignores comments and blank lines', () => {
    const rules = parseRobotsTxt('# comment\n\nUser-agent: *\n# another\nDisallow: /x');
    expect(rules.groups).toHaveLength(1);
  });
});
