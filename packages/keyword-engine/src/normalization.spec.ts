import { normalizeKeyword, normalizeArabicKeyword, normalizeEnglishKeyword, keywordHash, detectLanguage } from './normalization';

describe('keyword normalization (Sections 3-4, Test 112)', () => {
  describe('Arabic normalization', () => {
    it('normalizes hamza/alef variants for matching', () => {
      const a = normalizeArabicKeyword('شركة إعلانات');
      const b = normalizeArabicKeyword('شركة اعلانات');
      expect(a).toBe(b);
    });

    it('normalizes آ / أ / إ to ا', () => {
      expect(normalizeArabicKeyword('آدم')).toBe(normalizeArabicKeyword('ادم'));
      expect(normalizeArabicKeyword('أحمد')).toBe(normalizeArabicKeyword('احمد'));
      expect(normalizeArabicKeyword('إبراهيم')).toBe(normalizeArabicKeyword('ابراهيم'));
    });

    it('normalizes ى to ي', () => {
      expect(normalizeArabicKeyword('مصطفى')).toBe(normalizeArabicKeyword('مصطفي'));
    });

    it('normalizes ة to ه', () => {
      expect(normalizeArabicKeyword('مدينة')).toBe(normalizeArabicKeyword('مدينه'));
    });

    it('removes tatweel and diacritics', () => {
      expect(normalizeArabicKeyword('سيو')).toBe('سيو');
      const withTatweel = normalizeArabicKeyword('سيو\u0640\u0640');
      expect(withTatweel).toBe('سيو');
    });

    it('preserves the original keyword (never overwrites)', () => {
      const original = 'شركة إعلانات';
      const normalized = normalizeKeyword(original);
      expect(original).toBe('شركة إعلانات');
      expect(normalized).not.toBe(original); // normalized differs
    });

    it('collapses duplicate whitespace', () => {
      // ة normalizes to ه for matching, but whitespace collapses regardless.
      expect(normalizeArabicKeyword('شركة   تنظيف  منازل')).toBe('شركه تنظيف منازل');
    });
  });

  describe('English normalization', () => {
    it('lowercases, trims and collapses spaces', () => {
      expect(normalizeEnglishKeyword('  SEO   Services ')).toBe('seo services');
    });

    it('preserves brand spelling, numbers and meaningful symbols', () => {
      expect(normalizeEnglishKeyword('iPhone 15 Pro Max')).toBe('iphone 15 pro max');
      expect(normalizeEnglishKeyword('C++')).toBe('c++');
      expect(normalizeEnglishKeyword('New York')).toBe('new york');
    });
  });

  describe('normalizeKeyword + hash', () => {
    it('detects language', () => {
      expect(detectLanguage('شركة تنظيف')).toBe('ar');
      expect(detectLanguage('cleaning company')).toBe('en');
      expect(detectLanguage('')).toBe(null);
    });

    it('produces a stable hash for equivalent Arabic variants', () => {
      expect(keywordHash('شركة إعلانات')).toBe(keywordHash('شركة اعلانات'));
      expect(keywordHash('أفضل شركة')).toBe(keywordHash('افضل شركة'));
    });

    it('produces distinct hashes for different keywords', () => {
      expect(keywordHash('cleaning')).not.toBe(keywordHash('cleaning services'));
    });
  });
});