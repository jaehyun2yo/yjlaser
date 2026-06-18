import {
  buildFolderListUrl,
  buildFolderTreeUrl,
  toBreadcrumbPath,
} from '@/app/webhard/_lib/folderLoading';

describe('AUDIT-07 webhard lazy folder loading helpers', () => {
  it('root 조회 URL은 parentId를 보내지 않고 children 조회는 parentId를 명시한다', () => {
    expect(buildFolderListUrl({ parentId: null, companyId: '7' })).toBe(
      '/api/webhard/folders?companyId=7'
    );

    expect(buildFolderListUrl({ parentId: 'folder-child', companyId: '7' })).toBe(
      '/api/webhard/folders?parentId=folder-child&companyId=7'
    );
  });

  it('명시 전체 트리 조회는 /folders/tree endpoint를 사용한다', () => {
    expect(buildFolderTreeUrl({ companyId: '7' })).toBe('/api/webhard/folders/tree?companyId=7');
  });

  it('breadcrumb는 lazy children 목록이 아니라 ancestors 응답의 current로 구성한다', () => {
    expect(
      toBreadcrumbPath({
        ancestors: [
          { id: 'root', name: 'Root', parent_id: null },
          { id: 'parent', name: 'Parent', parent_id: 'root' },
        ],
        current: { id: 'current', name: 'Current', parent_id: 'parent' },
      })
    ).toEqual([
      { id: 'root', name: 'Root', parent_id: null },
      { id: 'parent', name: 'Parent', parent_id: 'root' },
      { id: 'current', name: 'Current', parent_id: 'parent' },
    ]);
  });
});
