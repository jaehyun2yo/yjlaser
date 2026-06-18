import {
  buildWebhardFileFixture,
  buildWebhardFolderTreeFixture,
  shouldRunWebhardPerfTests,
} from '../../../test/helpers/test-utils';

describe('AUDIT-06 webhard performance fixture gate', () => {
  it('기본 Jest 실행에서는 heavy fixture 테스트를 비활성화한다', () => {
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: undefined })).toBe(false);
    expect(shouldRunWebhardPerfTests({ RUN_PERF_TESTS: '1' })).toBe(true);
  });
});

const describePerf = shouldRunWebhardPerfTests() ? describe : describe.skip;

describePerf('AUDIT-06 opt-in webhard performance fixtures', () => {
  it('10k folders와 100k files fixture를 deterministic하게 만든다', () => {
    const folders = buildWebhardFolderTreeFixture({
      prefix: 'perf-audit06-heavy',
      totalFolders: 10_000,
      childrenPerFolder: 8,
      companyId: 77,
    });
    const files = buildWebhardFileFixture({
      prefix: 'perf-audit06-heavy',
      totalFiles: 100_000,
      folderIds: folders.slice(0, 128).map((folder) => folder.id),
      companyId: 77,
    });

    expect(folders).toHaveLength(10_000);
    expect(files).toHaveLength(100_000);
    expect(folders[9999]?.id).toBe('perf-audit06-heavy-folder-009999');
    expect(files[99999]?.id).toBe('perf-audit06-heavy-file-099999');
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
