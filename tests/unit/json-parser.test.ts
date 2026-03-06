import { describe, it, expect, vi } from 'vitest';

// Mock the logger to avoid config/dotenv dependency chain
vi.mock('../../server/logger.js', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { robustJsonParse } from '../../server/llm/json-parser.js';

describe('robustJsonParse', () => {
  it('should parse valid JSON directly', () => {
    const result = robustJsonParse<{ name: string }>('{"name": "test"}');
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON wrapped in markdown code block', () => {
    const input = '```json\n{"name": "test"}\n```';
    const result = robustJsonParse<{ name: string }>(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON wrapped in plain markdown code block', () => {
    const input = '```\n{"name": "test"}\n```';
    const result = robustJsonParse<{ name: string }>(input);
    expect(result).toEqual({ name: 'test' });
  });

  it('should parse JSON with leading text', () => {
    const input = 'Here is the result:\n\n{"score": 8, "reason": "good"}';
    const result = robustJsonParse<{ score: number }>(input);
    expect(result.score).toBe(8);
  });

  it('should parse JSON array', () => {
    const input = '[{"id": 1}, {"id": 2}]';
    const result = robustJsonParse<Array<{ id: number }>>(input);
    expect(result).toHaveLength(2);
  });

  it('should parse array wrapped in markdown', () => {
    const input = '```\n[{"id": 1}]\n```';
    const result = robustJsonParse<Array<{ id: number }>>(input);
    expect(result).toHaveLength(1);
  });

  it('should handle trailing comma in object', () => {
    const input = '{"name": "test", "value": 1,}';
    const result = robustJsonParse<{ name: string; value: number }>(input);
    expect(result.name).toBe('test');
    expect(result.value).toBe(1);
  });

  it('should handle trailing comma in array', () => {
    const input = '[1, 2, 3,]';
    const result = robustJsonParse<number[]>(input);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should throw on completely invalid input', () => {
    expect(() => robustJsonParse('not json at all')).toThrow();
  });

  it('should throw on empty string', () => {
    expect(() => robustJsonParse('')).toThrow();
  });

  it('should handle nested objects', () => {
    const input = '{"data": {"nested": true}, "count": 5}';
    const result = robustJsonParse<{ data: { nested: boolean }; count: number }>(input);
    expect(result.data.nested).toBe(true);
    expect(result.count).toBe(5);
  });

  it('should handle deeply nested objects', () => {
    const input = '{"a": {"b": {"c": {"d": 42}}}}';
    const result = robustJsonParse<{ a: { b: { c: { d: number } } } }>(input);
    expect(result.a.b.c.d).toBe(42);
  });

  it('should handle JSON with surrounding text on both sides', () => {
    const input = 'The analysis result is:\n{"score": 9}\nThank you.';
    const result = robustJsonParse<{ score: number }>(input);
    expect(result.score).toBe(9);
  });

  it('should handle JSON array with surrounding text', () => {
    const input = 'Results:\n[{"id": 1}, {"id": 2}]\nEnd of results.';
    const result = robustJsonParse<Array<{ id: number }>>(input);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
  });

  it('should parse JSON with various value types', () => {
    const input = '{"str": "hello", "num": 42, "bool": true, "nil": null, "arr": [1,2]}';
    const result = robustJsonParse<{
      str: string;
      num: number;
      bool: boolean;
      nil: null;
      arr: number[];
    }>(input);
    expect(result.str).toBe('hello');
    expect(result.num).toBe(42);
    expect(result.bool).toBe(true);
    expect(result.nil).toBeNull();
    expect(result.arr).toEqual([1, 2]);
  });

  it('should handle JSON with unicode characters', () => {
    const input = '{"name": "测试角色", "title": "安全管理员"}';
    const result = robustJsonParse<{ name: string; title: string }>(input);
    expect(result.name).toBe('测试角色');
    expect(result.title).toBe('安全管理员');
  });
});
