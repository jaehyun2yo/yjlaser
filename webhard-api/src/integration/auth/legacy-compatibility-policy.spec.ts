import {
  LEGACY_COMPATIBILITY_POLICIES,
  findLegacyCompatibilityPolicy,
} from './legacy-compatibility-policy';

describe('legacy compatibility policy ledger', () => {
  it('remains a separate immutable census-owned ledger without inventing grace', () => {
    expect(LEGACY_COMPATIBILITY_POLICIES).toEqual([]);
    expect(Object.isFrozen(LEGACY_COMPATIBILITY_POLICIES)).toBe(true);
    expect(
      findLegacyCompatibilityPolicy('GET', '/files', 'external_webhard_sync', 'dev')
    ).toBeUndefined();
  });
});
