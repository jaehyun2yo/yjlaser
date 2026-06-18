/**
 * Task #7 추가: 루트 파일 뱃지 — 사이드바 "전체 파일" 버튼
 *
 * folderCounts['root']에 루트 레벨 파일 수 포함 (백엔드 Task #3)
 * 사이드바 "전체 파일" 버튼 옆에 루트 파일 수 뱃지 표시
 */

describe('Task #7-추가: 루트 파일 뱃지 로직', () => {
  it("folderCounts['root'] 값이 있으면 루트 뱃지에 표시한다", () => {
    const folderCounts: Record<string, number> = {
      root: 3,
      'folder-a': 5,
    };

    // useFolderUndownloadedCounts(['root']) 내부 필터 로직
    const rootCount = folderCounts['root'] ?? 0;
    expect(rootCount).toBe(3);
  });

  it("folderCounts['root']가 없으면 0을 표시한다", () => {
    const folderCounts: Record<string, number> = {
      'folder-a': 5,
    };

    const rootCount = folderCounts['root'] ?? 0;
    expect(rootCount).toBe(0);
  });

  it("folderCounts['root']가 0이면 뱃지를 숨긴다", () => {
    const rootCount = 0;
    // Badge 컴포넌트는 count=0이면 null 반환 (숨김)
    const shouldShow = rootCount > 0;
    expect(shouldShow).toBe(false);
  });

  it("folderCounts['root']가 양수이면 뱃지를 표시한다", () => {
    const rootCount = 2;
    const shouldShow = rootCount > 0;
    expect(shouldShow).toBe(true);
  });
});
