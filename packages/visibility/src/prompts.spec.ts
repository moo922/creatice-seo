import { buildStandardPromptSet, VISIBILITY_CATEGORY_ORDER } from './prompts';

describe('buildStandardPromptSet', () => {
  it('produces one prompt per category in the standard order', () => {
    const prompts = buildStandardPromptSet({ industry: 'SEO', product: 'SEO tools', location: 'Cairo', problem: 'ranking issues' });
    expect(prompts.map((prompt) => prompt.category)).toEqual(VISIBILITY_CATEGORY_ORDER);
    expect(prompts).toHaveLength(7);
  });

  it('is standardized: identical contexts produce identical prompts', () => {
    const context = { industry: 'SEO', product: 'SEO tools', location: 'Cairo', problem: 'ranking issues' };
    expect(buildStandardPromptSet(context)).toEqual(buildStandardPromptSet(context));
  });

  it('parameterizes only industry/product/location/problem', () => {
    const prompts = buildStandardPromptSet({ industry: 'SEO', product: 'SEO tools', location: 'Cairo', problem: 'ranking issues' });
    const local = prompts.find((prompt) => prompt.category === 'LOCAL')!;
    expect(local.prompt).toContain('Cairo');
    const comparison = prompts.find((prompt) => prompt.category === 'COMPARISON')!;
    expect(comparison.prompt).toContain('SEO tools');
    expect(comparison.prompt).not.toContain('Cairo');
  });

  it('falls back to generic wording when context is empty', () => {
    const prompts = buildStandardPromptSet({ industry: '', product: '', location: '', problem: '' });
    expect(prompts.every((prompt) => prompt.prompt.length > 0)).toBe(true);
  });
});
