/**
 * React Query 캐시 키 팩토리 테스트
 */

import { queryKeys } from '@/lib/react-query/queryKeys';

describe('queryKeys.contacts', () => {
  it('all은 ["contacts"] 배열을 반환한다', () => {
    expect(queryKeys.contacts.all).toEqual(['contacts']);
  });

  it('lists()는 ["contacts", "list"]를 반환한다', () => {
    expect(queryKeys.contacts.lists()).toEqual(['contacts', 'list']);
  });

  it('list(filters)는 필터를 포함한 배열을 반환한다', () => {
    const filters = { status: 'received', page: 1 };
    const key = queryKeys.contacts.list(filters);
    expect(key[0]).toBe('contacts');
    expect(key[1]).toBe('list');
    expect(key[2]).toEqual(filters);
  });

  it('list() 필터 없이 호출하면 undefined가 마지막 요소로 포함된다', () => {
    const key = queryKeys.contacts.list();
    expect(key[0]).toBe('contacts');
    expect(key[1]).toBe('list');
  });

  it('detail(id)는 ["contacts", "detail", id]를 반환한다', () => {
    const key = queryKeys.contacts.detail(42);
    expect(key).toEqual(['contacts', 'detail', 42]);
  });

  it('detail(id)는 문자열 id도 처리한다', () => {
    const key = queryKeys.contacts.detail('abc-123');
    expect(key).toContain('abc-123');
  });

  it('status(id)는 detail 키에 "status"를 추가한 배열을 반환한다', () => {
    const key = queryKeys.contacts.status(1);
    expect(key).toEqual(['contacts', 'detail', 1, 'status']);
  });

  it('timeline(id)는 detail 키에 "timeline"을 추가한 배열을 반환한다', () => {
    const key = queryKeys.contacts.timeline(1);
    expect(key).toEqual(['contacts', 'detail', 1, 'timeline']);
  });
});

describe('queryKeys.companies', () => {
  it('all은 ["companies"] 배열을 반환한다', () => {
    expect(queryKeys.companies.all).toEqual(['companies']);
  });

  it('detail(id)는 올바른 계층 구조를 반환한다', () => {
    const key = queryKeys.companies.detail(5);
    expect(key).toEqual(['companies', 'detail', 5]);
  });

  it('profile(id)는 detail 키에 "profile"을 추가한다', () => {
    const key = queryKeys.companies.profile(5);
    expect(key).toEqual(['companies', 'detail', 5, 'profile']);
  });
});

describe('queryKeys.webhard', () => {
  it('all은 ["webhard"] 배열을 반환한다', () => {
    expect(queryKeys.webhard.all).toEqual(['webhard']);
  });

  it('folders.children(parentId)는 parentId를 포함한다', () => {
    const key = queryKeys.webhard.folders.children('folder-abc');
    expect(key).toContain('folder-abc');
    expect(key).toContain('children');
  });

  it('folders.children(null)은 null root를 표현한다', () => {
    const key = queryKeys.webhard.folders.children(null);
    expect(key).toContain(null);
  });

  it('files.list(filters)는 필터를 포함한다', () => {
    const filters = { folderId: 'folder-1', search: '도면' };
    const key = queryKeys.webhard.files.list(filters);
    expect(key[key.length - 1]).toEqual(filters);
  });

  it('search.modal과 search.dropdown이 동일한 키를 반환한다 (캐시 공유)', () => {
    const query = '도면파일';
    expect(queryKeys.webhard.search.modal(query)).toEqual(queryKeys.webhard.search.dropdown(query));
  });

  it('storage(userType, userId)는 userType과 userId를 포함한다', () => {
    const key = queryKeys.webhard.storage('company', 42);
    expect(key).toContain('storage');
    expect(key).toContain('company');
    expect(key).toContain(42);
  });

  it('storageAll은 저장공간 쿼리 prefix를 반환한다', () => {
    expect(queryKeys.webhard.storageAll()).toEqual(['webhard', 'storage']);
  });

  it('badgeCounts는 admin/company scope와 folderCounts 옵션을 캐시 키에 포함한다', () => {
    const companyKey = queryKeys.webhard.badgeCounts({
      companyId: 42,
      includeFolderCounts: true,
    });
    const anotherCompanyKey = queryKeys.webhard.badgeCounts({
      companyId: 77,
      includeFolderCounts: true,
    });
    const noFolderCountsKey = queryKeys.webhard.badgeCounts({
      companyId: 42,
      includeFolderCounts: false,
    });

    expect(queryKeys.webhard.badgeCounts()).toEqual(['webhard', 'badge-counts']);
    expect(companyKey).not.toEqual(anotherCompanyKey);
    expect(companyKey).not.toEqual(noFolderCountsKey);
    expect(companyKey[companyKey.length - 1]).toEqual({
      companyId: 42,
      includeFolderCounts: true,
    });
  });
});

describe('queryKeys.notifications', () => {
  it('all은 ["notifications"] 배열을 반환한다', () => {
    expect(queryKeys.notifications.all).toEqual(['notifications']);
  });

  it('count()는 ["notifications", "count"]를 반환한다', () => {
    expect(queryKeys.notifications.count()).toEqual(['notifications', 'count']);
  });

  it('count("all")도 전체 count prefix를 반환한다', () => {
    expect(queryKeys.notifications.count('all')).toEqual(['notifications', 'count']);
  });

  it('count(category)는 카테고리를 포함한다', () => {
    expect(queryKeys.notifications.count('webhard')).toEqual(['notifications', 'count', 'webhard']);
  });

  it('list()는 필터 없는 전체 list prefix를 반환한다', () => {
    expect(queryKeys.notifications.list()).toEqual(['notifications', 'list']);
  });

  it('list(filters)는 필터를 포함한다', () => {
    const key = queryKeys.notifications.list({ unreadOnly: true, limit: 10 });
    expect(key[0]).toBe('notifications');
    expect(key[1]).toBe('list');
  });
});

describe('queryKeys.dashboard', () => {
  it('stats()는 ["dashboard", "stats"]를 반환한다', () => {
    expect(queryKeys.dashboard.stats()).toEqual(['dashboard', 'stats']);
  });

  it('contacts.daily()는 올바른 계층 구조를 반환한다', () => {
    expect(queryKeys.dashboard.contacts.daily()).toEqual(['dashboard', 'contacts', 'daily']);
  });
});

describe('queryKeys 키 고유성', () => {
  it('다른 도메인의 all 키는 서로 다르다', () => {
    expect(queryKeys.contacts.all).not.toEqual(queryKeys.companies.all);
    expect(queryKeys.contacts.all).not.toEqual(queryKeys.webhard.all);
    expect(queryKeys.notifications.all).not.toEqual(queryKeys.billing.all);
  });

  it('동일 도메인의 detail 키는 id에 따라 다르다', () => {
    expect(queryKeys.contacts.detail(1)).not.toEqual(queryKeys.contacts.detail(2));
  });

  it('contacts.status와 contacts.timeline은 다른 키를 가진다', () => {
    expect(queryKeys.contacts.status(1)).not.toEqual(queryKeys.contacts.timeline(1));
  });
});
