/**
 * Client-side scope parsing.
 *
 * The gateway is the authority — app/scope.py reuses Pentesters-Team's
 * scope_guard verbatim. This only catches typos before they become a 422, so
 * an operator sees "not a domain: exmaple..org" while typing rather than after
 * submitting.
 */

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export interface ParsedScope {
  valid: string[];
  invalid: string[];
}

export function isIpv4(value: string): boolean {
  const match = IPV4_RE.exec(value);
  return match !== null && match.slice(1).every(o => Number(o) <= 255 && String(Number(o)) === o);
}

export function isCidr(value: string): boolean {
  const slash = value.lastIndexOf('/');
  if (slash === -1) return false;

  const address = value.slice(0, slash);
  const prefix = value.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefix)) return false;

  const bits = Number(prefix);
  return isIpv4(address) && bits >= 0 && bits <= 32;
}

export function isDomain(value: string): boolean {
  return HOSTNAME_RE.test(value);
}

/**
 * Splits on newlines and commas, trims, drops blanks and duplicates, then sorts
 * each entry into valid or invalid. A CIDR, a bare IP and a domain are all
 * accepted — the field label tells the operator which one belongs where, but
 * rejecting a valid IP typed into the domains box would be pedantic.
 */
export function parseScopeList(raw: string): ParsedScope {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];

  for (const piece of raw.split(/[\n,]/)) {
    const entry = piece.trim().toLowerCase();
    if (entry === '' || seen.has(entry)) continue;
    seen.add(entry);

    if (isDomain(entry) || isCidr(entry) || isIpv4(entry)) valid.push(entry);
    else invalid.push(entry);
  }

  return { valid, invalid };
}

/**
 * Splits input from any of the panel's three injection modes into entries,
 * without judging them.
 *
 * Deliberately more forgiving than parseScopeList's `[\n,]`: a pasted block or
 * an uploaded .txt is whatever the operator had lying around — one host per
 * line, space separated, semicolons, and `#` comments from a hand-maintained
 * scope file. Validation happens afterwards, so a malformed entry is staged
 * and shown as rejected rather than silently vanishing on paste.
 */
export function splitScopeInput(raw: string): string[] {
  const seen = new Set<string>();
  const entries: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const withoutComment = line.split('#')[0];
    for (const piece of withoutComment.split(/[,;\s]+/)) {
      const entry = piece.trim().toLowerCase();
      if (entry === '' || seen.has(entry)) continue;
      seen.add(entry);
      entries.push(entry);
    }
  }

  return entries;
}

export interface ClassifiedScope {
  rootDomains: string[];
  cidrs: string[];
  invalid: string[];
}

/**
 * Sorts staged entries into the two lists a Target actually has, so the
 * operator never has to pre-sort a pasted host list by hand.
 *
 * A bare IPv4 goes to `cidrs`, not `invalid`: app/scope.py reads that list
 * with ipaddress.ip_network(strict=False), which treats "10.0.0.5" as
 * 10.0.0.5/32. `cidrs` is therefore the only field on Target that can express
 * a single host, and rejecting one here would leave it unexpressible.
 */
export function classifyScopeEntries(entries: readonly string[]): ClassifiedScope {
  const rootDomains: string[] = [];
  const cidrs: string[] = [];
  const invalid: string[] = [];

  for (const entry of entries) {
    if (isDomain(entry)) rootDomains.push(entry);
    else if (isCidr(entry) || isIpv4(entry)) cidrs.push(entry);
    else invalid.push(entry);
  }

  return { rootDomains, cidrs, invalid };
}

/** What a staged entry will become — drives the badge next to each chip. */
export type ScopeEntryKind = 'domain' | 'cidr' | 'invalid';

export function classifyScopeEntry(entry: string): ScopeEntryKind {
  if (isDomain(entry)) return 'domain';
  if (isCidr(entry) || isIpv4(entry)) return 'cidr';
  return 'invalid';
}
