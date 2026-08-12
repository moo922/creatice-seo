import {
  arabicMorphologicalVariants,
  detectKeywordStuffing,
  isArabic,
  normalizeArabic,
  semanticKeywordCoverage,
  verifyRegionalTerminology,
} from './arabic';

describe('arabic utilities', () => {
  it('detects Arabic text', () => {
    expect(isArabic('تحسين محركات البحث')).toBe(true);
    expect(isArabic('SEO tools')).toBe(false);
  });

  it('normalizes hamza/alef forms and strips diacritics', () => {
    expect(normalizeArabic('تَحْلِيلُ مُحَرِّكِ')).toBe('تحليل محرك');
    expect(normalizeArabic('إعلانات وآثار')).toBe('اعلانات واثار');
  });

  it('generates morphological variants for Arabic terms', () => {
    const variants = arabicMorphologicalVariants('تحسين');
    expect(variants.has('تحسين')).toBe(true);
    expect(variants.has('التحسين')).toBe(true);
    expect(variants.has('والتحسين')).toBe(true);
  });

  it('counts Arabic morphological variants as semantic coverage', () => {
    const content = 'نقدم خدمة التحسين لمحركات البحث. والتحسين المستمر يحقق نتائج.';
    const result = semanticKeywordCoverage(content, 'تحسين', 'ar');
    expect(result.coverage).toBeGreaterThan(0);
    expect(result.variantMatches).toBeGreaterThan(1);
  });

  it('flags unnatural Arabic repetition as stuffing but tolerates variants', () => {
    const natural = 'التحسين والتحسين المستمر والتحسين التقني جميعها خدماتنا، التحسين يهمنا، التحسين يهمك، التحسين هدفنا.';
    const result = detectKeywordStuffing(natural, ['تحسين'], 'ar');
    expect(result.stuffed).toBe(true);
  });

  it('flags heavy English exact-match repetition as stuffing', () => {
    const content = 'seo service seo service seo service seo service seo service';
    const result = detectKeywordStuffing(content, ['seo service'], 'en');
    expect(result.stuffed).toBe(true);
  });

  it('verifies regional terminology is preserved verbatim', () => {
    const content = 'نقدم بطاقة فيزا وسحب كاش في مصر.';
    const result = verifyRegionalTerminology(content, ['كاش']);
    expect(result.preserved).toContain('كاش');
    expect(result.missing).toHaveLength(0);
  });

  it('reports missing regional terminology', () => {
    const result = verifyRegionalTerminology('نقدم بطاقات فيزا في مصر.', ['كاش']);
    expect(result.missing).toContain('كاش');
  });
});
