import { describe, it, expect } from 'vitest';
import { isLocalOrSecureEndpoint, cosineSimilarity, isOldFormat, convertToNewFormat } from '../src/js/utils.js';

describe('isLocalOrSecureEndpoint', () => {
  it('identifies localhost correctly', () => {
    expect(isLocalOrSecureEndpoint('http://localhost:8080')).toEqual({
      isLocal: true,
      isSecure: false,
      hostname: 'localhost',
      protocol: 'http:'
    });

    expect(isLocalOrSecureEndpoint('https://localhost:8080')).toEqual({
      isLocal: true,
      isSecure: true,
      hostname: 'localhost',
      protocol: 'https:'
    });
  });

  it('identifies 127.0.0.1 as local', () => {
    expect(isLocalOrSecureEndpoint('http://127.0.0.1:1234')).toMatchObject({
      isLocal: true,
      isSecure: false
    });
  });

  it('identifies IPv6 localhost (::1) correctly', () => {
    const result = isLocalOrSecureEndpoint('http://[::1]:8080');
    expect(result.hostname).toBe('[::1]');
    expect(result.isSecure).toBe(false);
  });

  it('identifies private network ranges correctly', () => {
    expect(isLocalOrSecureEndpoint('http://192.168.1.1')).toMatchObject({
      isLocal: true
    });

    expect(isLocalOrSecureEndpoint('http://10.0.0.1')).toMatchObject({
      isLocal: true
    });

    expect(isLocalOrSecureEndpoint('http://172.16.0.1')).toMatchObject({
      isLocal: true
    });

    expect(isLocalOrSecureEndpoint('http://172.31.255.255')).toMatchObject({
      isLocal: true
    });
  });

  it('rejects non-private 172.x.x.x addresses', () => {
    expect(isLocalOrSecureEndpoint('http://172.15.0.1')).toMatchObject({
      isLocal: false
    });

    expect(isLocalOrSecureEndpoint('http://172.32.0.1')).toMatchObject({
      isLocal: false
    });
  });

  it('identifies remote hosts as non-local', () => {
    expect(isLocalOrSecureEndpoint('http://example.com')).toMatchObject({
      isLocal: false,
      isSecure: false
    });

    expect(isLocalOrSecureEndpoint('https://api.example.com')).toMatchObject({
      isLocal: false,
      isSecure: true
    });
  });

  it('identifies HTTPS correctly', () => {
    expect(isLocalOrSecureEndpoint('https://example.com')).toMatchObject({
      isSecure: true,
      protocol: 'https:'
    });

    expect(isLocalOrSecureEndpoint('http://example.com')).toMatchObject({
      isSecure: false,
      protocol: 'http:'
    });
  });

  it('handles invalid URLs gracefully', () => {
    expect(isLocalOrSecureEndpoint('not-a-url')).toEqual({
      isLocal: false,
      isSecure: false,
      hostname: '',
      protocol: ''
    });

    expect(isLocalOrSecureEndpoint('')).toEqual({
      isLocal: false,
      isSecure: false,
      hostname: '',
      protocol: ''
    });
  });

  it('handles special cases', () => {
    expect(isLocalOrSecureEndpoint('file:///path/to/file')).toMatchObject({
      protocol: 'file:',
      isSecure: false
    });
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBe(1);
  });

  it('returns NaN for orthogonal vectors with zeros', () => {
    const vecA = [1, 0, 0];
    const vecB = [0, 1, 0];
    expect(cosineSimilarity(vecA, vecB)).toBeNaN();
  });

  it('calculates correct similarity for typical vectors', () => {
    const vecA = [1, 2, 3];
    const vecB = [4, 5, 6];
    const result = cosineSimilarity(vecA, vecB);
    expect(result).toBeCloseTo(0.9746, 4);
  });

  it('handles negative values', () => {
    const vecA = [1, -1];
    const vecB = [-1, 1];
    expect(cosineSimilarity(vecA, vecB)).toBeCloseTo(-1, 10);
  });

  it('returns 0 for invalid input types', () => {
    expect(cosineSimilarity(null, [1, 2, 3])).toBe(0);
    expect(cosineSimilarity([1, 2, 3], null)).toBe(0);
    expect(cosineSimilarity('not an array', [1, 2, 3])).toBe(0);
    expect(cosineSimilarity({}, {})).toBe(0);
  });

  it('handles empty vectors', () => {
    expect(cosineSimilarity([], [])).toBeNaN();
  });

  it('handles vectors with different lengths', () => {
    const vecA = [1, 2, 3];
    const vecB = [1, 2];
    const result = cosineSimilarity(vecA, vecB);
    expect(result).toBeGreaterThan(0);
  });

  it('handles zero vectors', () => {
    const vecA = [0, 0, 0];
    const vecB = [1, 2, 3];
    expect(cosineSimilarity(vecA, vecB)).toBeNaN();
  });
});

describe('isOldFormat', () => {
  it('identifies old format (values are strings)', () => {
    const oldData = {
      "email": "john@example.com",
      "name": "John Doe"
    };
    expect(isOldFormat(oldData)).toBe(true);
  });

  it('identifies new format (values are arrays)', () => {
    const newData = {
      "john@example.com": ["email", "emailAddress"],
      "John Doe": ["name", "fullName"]
    };
    expect(isOldFormat(newData)).toBe(false);
  });

  it('returns true for mixed format', () => {
    const mixedData = {
      "john@example.com": ["email"],
      "name": "John Doe"
    };
    expect(isOldFormat(mixedData)).toBe(true);
  });

  it('handles empty objects', () => {
    expect(isOldFormat({})).toBe(false);
  });
});

describe('convertToNewFormat', () => {
  it('converts old format to new format', () => {
    const oldData = {
      "email": "john@example.com",
      "emailAddress": "john@example.com",
      "name": "John Doe"
    };

    const result = convertToNewFormat(oldData);

    expect(result).toEqual({
      "john@example.com": ["email", "emailAddress"],
      "John Doe": ["name"]
    });
  });

  it('groups multiple fields with same value', () => {
    const oldData = {
      "field1": "value1",
      "field2": "value1",
      "field3": "value1",
      "field4": "value2"
    };

    const result = convertToNewFormat(oldData);

    expect(result["value1"]).toHaveLength(3);
    expect(result["value1"]).toContain("field1");
    expect(result["value1"]).toContain("field2");
    expect(result["value1"]).toContain("field3");
    expect(result["value2"]).toEqual(["field4"]);
  });

  it('skips entries that are already in array format', () => {
    const mixedData = {
      "value1": ["field1", "field2"],
      "field3": "value2"
    };

    const result = convertToNewFormat(mixedData);

    expect(result).not.toHaveProperty("field1");
    expect(result).not.toHaveProperty("field2");
    expect(result).toHaveProperty("value2");
    expect(result["value2"]).toEqual(["field3"]);
  });

  it('handles empty objects', () => {
    expect(convertToNewFormat({})).toEqual({});
  });

  it('preserves unique field names', () => {
    const oldData = {
      "uniqueField": "uniqueValue"
    };

    const result = convertToNewFormat(oldData);

    expect(result).toEqual({
      "uniqueValue": ["uniqueField"]
    });
  });
});
