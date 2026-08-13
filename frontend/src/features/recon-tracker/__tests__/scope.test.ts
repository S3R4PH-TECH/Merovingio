import { describe, expect, it } from 'vitest';
import {
  classifyScopeEntries,
  classifyScopeEntry,
  parseScopeList,
  splitScopeInput,
} from '../lib/scope';

describe('splitScopeInput', () => {
  it('reads one host per line, the shape recon tools write', () => {
    expect(splitScopeInput('example.org\napi.example.org')).toEqual([
      'example.org',
      'api.example.org',
    ]);
  });

  it('accepts the separators a pasted list actually arrives with', () => {
    expect(splitScopeInput('a.com, b.com; c.com d.com')).toEqual([
      'a.com',
      'b.com',
      'c.com',
      'd.com',
    ]);
  });

  it('ignores comments, so a hand-maintained scope file pastes cleanly', () => {
    expect(splitScopeInput('# production\nexample.org  # main\n#api.example.org')).toEqual([
      'example.org',
    ]);
  });

  it('normalises case and drops duplicates across sources', () => {
    expect(splitScopeInput('Example.ORG\nexample.org\n\n  example.org  ')).toEqual([
      'example.org',
    ]);
  });

  it('survives Windows line endings', () => {
    expect(splitScopeInput('a.com\r\nb.com\r\n')).toEqual(['a.com', 'b.com']);
  });

  it('keeps malformed entries instead of silently dropping them', () => {
    // Staging them is the point: an entry that vanished on paste is one the
    // operator never learns was rejected.
    expect(splitScopeInput('good.com\nnot a host!!')).toContain('not');
  });
});

describe('classifyScopeEntries', () => {
  it('splits entries into the two fields a Target actually has', () => {
    expect(classifyScopeEntries(['example.org', '10.0.0.0/24', 'api.example.org'])).toEqual({
      rootDomains: ['example.org', 'api.example.org'],
      cidrs: ['10.0.0.0/24'],
      invalid: [],
    });
  });

  it('sends a bare IP to cidrs, the only field that can express one host', () => {
    // app/scope.py parses that list with ip_network(strict=False), so
    // "10.0.0.5" resolves as 10.0.0.5/32.
    expect(classifyScopeEntries(['10.0.0.5']).cidrs).toEqual(['10.0.0.5']);
    expect(classifyScopeEntries(['10.0.0.5']).invalid).toEqual([]);
  });

  it('reports what it could not place', () => {
    expect(classifyScopeEntries(['http://example.org', '999.1.1.1']).invalid).toEqual([
      'http://example.org',
      '999.1.1.1',
    ]);
  });
});

describe('classifyScopeEntry', () => {
  it('labels each staged entry with where it is headed', () => {
    expect(classifyScopeEntry('example.org')).toBe('domain');
    expect(classifyScopeEntry('10.0.0.0/24')).toBe('cidr');
    expect(classifyScopeEntry('10.0.0.5')).toBe('cidr');
    expect(classifyScopeEntry('nope!!')).toBe('invalid');
  });
});

describe('parseScopeList', () => {
  it('still behaves as the out-of-scope field expects', () => {
    // Unchanged on purpose — the out-of-scope textarea still depends on it.
    expect(parseScopeList('admin.example.org, 10.0.0.5')).toEqual({
      valid: ['admin.example.org', '10.0.0.5'],
      invalid: [],
    });
  });
});
