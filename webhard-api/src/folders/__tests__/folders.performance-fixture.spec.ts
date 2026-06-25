import {
  buildWebhardFileFixture,
  buildWebhardFolderTreeFixture,
  shouldRunWebhardPerfTests,
} from '../../../test/helpers/test-utils';

describe('AUDIT-06 webhard performance fixture gate', () => {
  it('RUN_PERF_TESTS=1일 때만 heavy fixture profile을 사용한다', () => {
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: undefined })).toBe(false);
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: '1' })).toBe(true);
  });
});

const heavyFixtureProfile = shouldRunWebhardPerfTests();
const fixtureProfile = heavyFixtureProfile
  ? { totalFolders: 10_000, totalFiles: 100_000 }
  : { totalFolders: 64, totalFiles: 512 };

describe('AUDIT-06 webhard performance fixtures', () => {
  it('folders와 files fixture를 deterministic하게 만든다', () => {
    const folders = buildWebhardFolderTreeFixture({
      prefix: 'perf-audit06-heavy',
      totalFolders: fixtureProfile.totalFolders,
      childrenPerFolder: 8,
      companyId: 77,
    });
    const files = buildWebhardFileFixture({
      prefix: 'perf-audit06-heavy',
      totalFiles: fixtureProfile.totalFiles,
      folderIds: folders.slice(0, 128).map((folder) => folder.id),
      companyId: 77,
    });

    expect(folders).toHaveLength(fixtureProfile.totalFolders);
    expect(files).toHaveLength(fixtureProfile.totalFiles);
    expect(folders[fixtureProfile.totalFolders - 1]?.id).toBe(
      `perf-audit06-heavy-folder-${String(fixtureProfile.totalFolders - 1).padStart(6, '0')}`
    );
    expect(files[fixtureProfile.totalFiles - 1]?.id).toBe(
      `perf-audit06-heavy-file-${String(fixtureProfile.totalFiles - 1).padStart(6, '0')}`
    );
    expect(
      buildWebhardFolderTreeFixture({
        prefix: 'perf-audit06-heavy',
        totalFolders: 3,
        childrenPerFolder: 8,
        companyId: 77,
      })
    ).toEqual(folders.slice(0, 3));
  });
});
