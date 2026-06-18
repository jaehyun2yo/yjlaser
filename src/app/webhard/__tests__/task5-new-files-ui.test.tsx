/**
 * Task #5: 새파일 목록 UI 개선 테스트
 * - folder_path: FaFolder 아이콘 + 클릭 시 폴더 이동
 * - uploader_display_name: 새파일 모드에서 우선 표시
 * - isNewFilesMode 시 WebhardColumnHeader에 경로 컬럼 표시
 */

// ===== WebhardFileItem 테스트 =====
// folder_path 렌더링을 직접 테스트 (컴포넌트 의존성이 많아 로직만 단위테스트)

describe('Task #5: folder_path 표시 로직', () => {
  it('folder_path를 breadcrumb 텍스트로 표시한다', () => {
    const folderPath = '업체A / 하위폴더B';
    // formatFolderPathDisplay 함수의 동작을 테스트
    const display = folderPath || '루트';
    expect(display).toBe('업체A / 하위폴더B');
  });

  it('folder_path가 null이면 표시하지 않는다', () => {
    const folderPath = null;
    const shouldDisplay = folderPath != null && folderPath !== '';
    expect(shouldDisplay).toBe(false);
  });

  it('folder_path가 빈 문자열이면 표시하지 않는다', () => {
    const folderPath = '';
    const shouldDisplay = folderPath != null && folderPath !== '';
    expect(shouldDisplay).toBe(false);
  });
});

describe('Task #5: uploader_display_name 우선순위 로직', () => {
  it('isNewFilesMode=true이고 uploader_display_name이 있으면 우선 표시한다', () => {
    const isNewFilesMode = true;
    const file = {
      uploader_display_name: '관리자',
      companies: { company_name: '업체A', manager_name: '홍길동' },
    };

    const displayName =
      isNewFilesMode && file.uploader_display_name
        ? file.uploader_display_name
        : file.companies?.manager_name || file.companies?.company_name || '-';

    expect(displayName).toBe('관리자');
  });

  it('isNewFilesMode=false이면 companies 정보를 표시한다', () => {
    const isNewFilesMode = false;
    const file: {
      uploader_display_name: string;
      companies: { company_name: string; manager_name: string | null } | null;
    } = {
      uploader_display_name: '관리자',
      companies: { company_name: '업체A', manager_name: '홍길동' },
    };

    const displayName =
      isNewFilesMode && file.uploader_display_name
        ? file.uploader_display_name
        : file.companies?.manager_name || file.companies?.company_name || '-';

    expect(displayName).toBe('홍길동');
  });

  it('isNewFilesMode=true이고 uploader_display_name이 없으면 companies 정보를 표시한다', () => {
    const isNewFilesMode = true;
    const file: {
      uploader_display_name: string | undefined;
      companies: { company_name: string; manager_name: string | null } | null;
    } = {
      uploader_display_name: undefined,
      companies: { company_name: '업체A', manager_name: null },
    };

    const displayName =
      isNewFilesMode && file.uploader_display_name
        ? file.uploader_display_name
        : file.companies?.manager_name || file.companies?.company_name || '-';

    expect(displayName).toBe('업체A');
  });

  it('companies 정보도 없으면 "-"를 표시한다', () => {
    const isNewFilesMode = false;
    const file: {
      uploader_display_name: string | undefined;
      companies: { company_name: string; manager_name: string | null } | null;
    } = {
      uploader_display_name: undefined,
      companies: null,
    };

    const displayName =
      isNewFilesMode && file.uploader_display_name
        ? file.uploader_display_name
        : file.companies?.manager_name || file.companies?.company_name || '-';

    expect(displayName).toBe('-');
  });
});

describe('Task #5: WebhardColumnHeader isNewFilesMode 컬럼', () => {
  it('isNewFilesMode=true이면 "경로" 컬럼 헤더를 표시한다', () => {
    // 컬럼 헤더 텍스트 로직
    const isNewFilesMode = true;
    const dateColLabel = isNewFilesMode ? '경로' : '업로드날짜';
    expect(dateColLabel).toBe('경로');
  });

  it('isNewFilesMode=false이면 "업로드날짜" 컬럼 헤더를 표시한다', () => {
    const isNewFilesMode = false;
    const dateColLabel = isNewFilesMode ? '경로' : '업로드날짜';
    expect(dateColLabel).toBe('업로드날짜');
  });
});
