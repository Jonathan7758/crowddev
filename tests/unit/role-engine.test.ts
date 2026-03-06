import { describe, it, expect } from 'vitest';

// Test version bumping logic directly (extracted from server/services/role-engine.ts)
const CRITICAL_FIELDS = new Set(['concerns', 'personality', 'decisionPowers', 'expertise']);

function bumpVersion(current: string, changedFields: string[]): string {
  const [major, minor, patch] = current.split('.').map(Number);
  const isCritical = changedFields.some(f => CRITICAL_FIELDS.has(f));
  if (isCritical) return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

describe('version bumping', () => {
  describe('non-critical field changes (patch bump)', () => {
    it('should bump patch for name change', () => {
      expect(bumpVersion('1.0.0', ['name'])).toBe('1.0.1');
    });

    it('should bump patch for title change', () => {
      expect(bumpVersion('1.0.0', ['title'])).toBe('1.0.1');
    });

    it('should bump patch for avatar change', () => {
      expect(bumpVersion('1.0.0', ['avatar'])).toBe('1.0.1');
    });

    it('should bump patch for organization change', () => {
      expect(bumpVersion('1.0.0', ['organization'])).toBe('1.0.1');
    });

    it('should bump patch for responsibilities change', () => {
      expect(bumpVersion('1.0.0', ['responsibilities'])).toBe('1.0.1');
    });
  });

  describe('critical field changes (minor bump)', () => {
    it('should bump minor for concerns change', () => {
      expect(bumpVersion('1.0.0', ['concerns'])).toBe('1.1.0');
    });

    it('should bump minor for personality change', () => {
      expect(bumpVersion('1.0.0', ['personality'])).toBe('1.1.0');
    });

    it('should bump minor for decisionPowers change', () => {
      expect(bumpVersion('1.0.0', ['decisionPowers'])).toBe('1.1.0');
    });

    it('should bump minor for expertise change', () => {
      expect(bumpVersion('1.0.0', ['expertise'])).toBe('1.1.0');
    });
  });

  describe('mixed field changes', () => {
    it('should bump minor if any critical field is changed alongside non-critical', () => {
      expect(bumpVersion('1.0.0', ['name', 'concerns'])).toBe('1.1.0');
    });

    it('should bump minor if multiple critical fields are changed', () => {
      expect(bumpVersion('1.0.0', ['concerns', 'personality'])).toBe('1.1.0');
    });

    it('should bump patch if only non-critical fields are changed', () => {
      expect(bumpVersion('1.0.0', ['name', 'title', 'avatar'])).toBe('1.0.1');
    });
  });

  describe('incrementing from non-zero versions', () => {
    it('should increment patch correctly from non-zero version', () => {
      expect(bumpVersion('1.2.3', ['name'])).toBe('1.2.4');
    });

    it('should increment minor and reset patch from non-zero version', () => {
      expect(bumpVersion('1.2.3', ['concerns'])).toBe('1.3.0');
    });

    it('should handle high version numbers', () => {
      expect(bumpVersion('5.10.20', ['avatar'])).toBe('5.10.21');
      expect(bumpVersion('5.10.20', ['expertise'])).toBe('5.11.0');
    });

    it('should preserve major version on all bumps', () => {
      expect(bumpVersion('3.0.0', ['name'])).toBe('3.0.1');
      expect(bumpVersion('3.0.0', ['personality'])).toBe('3.1.0');
    });
  });

  describe('edge cases', () => {
    it('should handle empty changedFields array as patch bump', () => {
      expect(bumpVersion('1.0.0', [])).toBe('1.0.1');
    });

    it('should handle version 0.0.0', () => {
      expect(bumpVersion('0.0.0', ['name'])).toBe('0.0.1');
      expect(bumpVersion('0.0.0', ['concerns'])).toBe('0.1.0');
    });
  });
});

describe('CRITICAL_FIELDS set', () => {
  it('should contain exactly the four critical fields', () => {
    expect(CRITICAL_FIELDS.size).toBe(4);
    expect(CRITICAL_FIELDS.has('concerns')).toBe(true);
    expect(CRITICAL_FIELDS.has('personality')).toBe(true);
    expect(CRITICAL_FIELDS.has('decisionPowers')).toBe(true);
    expect(CRITICAL_FIELDS.has('expertise')).toBe(true);
  });

  it('should not contain non-critical fields', () => {
    expect(CRITICAL_FIELDS.has('name')).toBe(false);
    expect(CRITICAL_FIELDS.has('title')).toBe(false);
    expect(CRITICAL_FIELDS.has('avatar')).toBe(false);
    expect(CRITICAL_FIELDS.has('organization')).toBe(false);
    expect(CRITICAL_FIELDS.has('responsibilities')).toBe(false);
  });
});
