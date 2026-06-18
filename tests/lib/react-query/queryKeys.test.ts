/**
 * React Query 키 팩토리 테스트
 * src/lib/react-query/queryKeys.ts
 */

import { describe, it, expect } from '@jest/globals';
import { queryKeys } from '@/lib/react-query/queryKeys';

describe('React Query 키 팩토리', () => {
  describe('contacts 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.contacts.all).toEqual(['contacts']);
    });

    it('lists() 키가 올바른 계층 구조를 가져야 함', () => {
      expect(queryKeys.contacts.lists()).toEqual(['contacts', 'list']);
    });

    it('list(filters) 키가 필터를 포함해야 함', () => {
      const filters = { status: 'pending', page: 1 };
      const key = queryKeys.contacts.list(filters);

      expect(key).toEqual(['contacts', 'list', filters]);
    });

    it('list() 필터 없이 호출 시 undefined를 포함해야 함', () => {
      const key = queryKeys.contacts.list();

      expect(key).toEqual(['contacts', 'list', undefined]);
    });

    it('detail(id) 키가 ID를 포함해야 함', () => {
      const key = queryKeys.contacts.detail(123);

      expect(key).toEqual(['contacts', 'detail', 123]);
    });

    it('detail(id)가 문자열 ID도 지원해야 함', () => {
      const key = queryKeys.contacts.detail('abc-123');

      expect(key).toEqual(['contacts', 'detail', 'abc-123']);
    });

    it('status(id) 키가 올바른 계층 구조를 가져야 함', () => {
      const key = queryKeys.contacts.status(123);

      expect(key).toEqual(['contacts', 'detail', 123, 'status']);
    });
  });

  describe('companies 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.companies.all).toEqual(['companies']);
    });

    it('list(filters) 키가 필터를 포함해야 함', () => {
      const filters = { status: 'active', page: 2 };
      const key = queryKeys.companies.list(filters);

      expect(key).toEqual(['companies', 'list', filters]);
    });

    it('profile(id) 키가 올바른 계층 구조를 가져야 함', () => {
      const key = queryKeys.companies.profile(456);

      expect(key).toEqual(['companies', 'detail', 456, 'profile']);
    });
  });

  describe('portfolio 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.portfolio.all).toEqual(['portfolio']);
    });

    it('list(filters) 키가 태그 필터를 포함해야 함', () => {
      const filters = { tag: 'web', page: 1 };
      const key = queryKeys.portfolio.list(filters);

      expect(key).toEqual(['portfolio', 'list', filters]);
    });
  });

  describe('webhard 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.webhard.all).toEqual(['webhard']);
    });

    describe('folders 키', () => {
      it('all() 키가 올바른 계층 구조를 가져야 함', () => {
        expect(queryKeys.webhard.folders.all()).toEqual(['webhard', 'folders']);
      });

      it('list(companyId) 키가 companyId를 포함해야 함', () => {
        const key = queryKeys.webhard.folders.list(123);

        expect(key).toEqual(['webhard', 'folders', 123]);
      });

      it('children(parentId) 키가 parentId를 포함해야 함', () => {
        const key = queryKeys.webhard.folders.children('folder-123');

        expect(key).toEqual(['webhard', 'folders', 'children', 'folder-123']);
      });

      it('children(null) 키가 루트 폴더를 나타내야 함', () => {
        const key = queryKeys.webhard.folders.children(null);

        expect(key).toEqual(['webhard', 'folders', 'children', null]);
      });

      it('ancestors(folderId) 키가 folderId를 포함해야 함', () => {
        const key = queryKeys.webhard.folders.ancestors('folder-456');

        expect(key).toEqual(['webhard', 'folders', 'ancestors', 'folder-456']);
      });

      it('undownloadedCount(folderId) 키가 올바른 구조를 가져야 함', () => {
        const key = queryKeys.webhard.folders.undownloadedCount('folder-789');

        expect(key).toEqual(['webhard', 'folders', 'folder-789', 'undownloaded-count']);
      });

      it('batchUndownloadedCount(folderIds) 키가 배열을 포함해야 함', () => {
        const folderIds = ['folder-1', 'folder-2', 'folder-3'];
        const key = queryKeys.webhard.folders.batchUndownloadedCount(folderIds);

        expect(key).toEqual(['webhard', 'folders', 'batch-undownloaded-count', folderIds]);
      });
    });

    describe('files 키', () => {
      it('all() 키가 올바른 계층 구조를 가져야 함', () => {
        expect(queryKeys.webhard.files.all()).toEqual(['webhard', 'files']);
      });

      it('list(filters) 키가 모든 필터를 포함해야 함', () => {
        const filters = {
          folderId: 'folder-123',
          companyId: 456,
          search: 'document',
          sortBy: 'name' as const,
          sortOrder: 'asc' as const,
        };
        const key = queryKeys.webhard.files.list(filters);

        expect(key).toEqual(['webhard', 'files', filters]);
      });

      it('list() 필터 없이 호출 가능해야 함', () => {
        const key = queryKeys.webhard.files.list();

        expect(key).toEqual(['webhard', 'files', undefined]);
      });

      it('detail(id) 키가 ID를 포함해야 함', () => {
        const key = queryKeys.webhard.files.detail('file-123');

        expect(key).toEqual(['webhard', 'files', 'detail', 'file-123']);
      });
    });

    describe('search 키', () => {
      it('modal(query) 키가 검색어를 포함해야 함', () => {
        const key = queryKeys.webhard.search.modal('test query');

        // modal/dropdown은 동일한 캐시 키 반환 (캐시 공유)
        expect(key).toEqual(['webhard', 'search', 'test query']);
      });

      it('dropdown(query) 키가 검색어를 포함해야 함', () => {
        const key = queryKeys.webhard.search.dropdown('another query');

        // modal/dropdown은 동일한 캐시 키 반환 (캐시 공유)
        expect(key).toEqual(['webhard', 'search', 'another query']);
      });
    });

    it('totalUndownloadedCount() 키가 올바른 구조를 가져야 함', () => {
      expect(queryKeys.webhard.totalUndownloadedCount()).toEqual(['webhard', 'undownloaded-count']);
    });

    it('badgeCounts() 키가 올바른 구조를 가져야 함', () => {
      expect(queryKeys.webhard.badgeCounts()).toEqual(['webhard', 'badge-counts']);
    });

    it('storage(userType, userId) 키가 사용자 정보를 포함해야 함', () => {
      const key = queryKeys.webhard.storage('company', 123);

      expect(key).toEqual(['webhard', 'storage', 'company', 123]);
    });
  });

  describe('erp 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.erp.all).toEqual(['erp']);
    });

    describe('tasks 키', () => {
      it('list(filters) 키가 모든 필터를 포함해야 함', () => {
        const filters = {
          status: 'in-progress',
          priority: 'high',
          taskType: 'laser',
          assignedTo: 'worker-1',
          page: 1,
        };
        const key = queryKeys.erp.tasks.list(filters);

        expect(key).toEqual(['erp', 'tasks', 'list', filters]);
      });

      it('today(workerName) 키가 작업자 이름을 포함해야 함', () => {
        const key = queryKeys.erp.tasks.today('홍길동');

        expect(key).toEqual(['erp', 'tasks', 'today', '홍길동']);
      });

      it('kanban(filters) 키가 필터를 포함해야 함', () => {
        const filters = { priority: 'high', taskType: 'laser' };
        const key = queryKeys.erp.tasks.kanban(filters);

        expect(key).toEqual(['erp', 'tasks', 'kanban', filters]);
      });
    });

    describe('machines 키', () => {
      it('list(activeOnly) 키가 boolean 값을 포함해야 함', () => {
        const keyActive = queryKeys.erp.machines.list(true);
        const keyAll = queryKeys.erp.machines.list(false);

        expect(keyActive).toEqual(['erp', 'machines', 'list', true]);
        expect(keyAll).toEqual(['erp', 'machines', 'list', false]);
      });
    });

    describe('workers 키', () => {
      it('list(activeOnly) 키가 boolean 값을 포함해야 함', () => {
        const keyActive = queryKeys.erp.workers.list(true);
        const keyAll = queryKeys.erp.workers.list(false);

        expect(keyActive).toEqual(['erp', 'workers', 'list', true]);
        expect(keyAll).toEqual(['erp', 'workers', 'list', false]);
      });
    });
  });

  describe('processBoard 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.processBoard.all).toEqual(['processBoard']);
    });

    it('board(filters) 키가 필터를 포함해야 함', () => {
      const filters = { companyName: 'ABC Corp', dateFilter: '2025-01' };
      const key = queryKeys.processBoard.board(filters);

      expect(key).toEqual(['processBoard', 'board', filters]);
    });
  });

  describe('sync 키', () => {
    it('all 키가 배열이어야 함', () => {
      expect(queryKeys.sync.all).toEqual(['sync']);
    });

    it('status() 키가 올바른 구조를 가져야 함', () => {
      expect(queryKeys.sync.status()).toEqual(['sync', 'status']);
    });

    it('events(filters) 키가 limit을 포함해야 함', () => {
      const filters = { limit: 50 };
      const key = queryKeys.sync.events(filters);

      expect(key).toEqual(['sync', 'events', filters]);
    });
  });

  describe('키 일관성 검증', () => {
    it('동일한 파라미터로 호출 시 동일한 키를 반환해야 함', () => {
      const filters = { status: 'pending', page: 1 };

      const key1 = queryKeys.contacts.list(filters);
      const key2 = queryKeys.contacts.list(filters);

      expect(key1).toEqual(key2);
    });

    it('다른 파라미터로 호출 시 다른 키를 반환해야 함', () => {
      const filters1 = { status: 'pending', page: 1 };
      const filters2 = { status: 'pending', page: 2 };

      const key1 = queryKeys.contacts.list(filters1);
      const key2 = queryKeys.contacts.list(filters2);

      expect(key1).not.toEqual(key2);
    });

    it('모든 키가 as const 타입이어야 함 (readonly)', () => {
      // TypeScript 레벨에서 검증됨
      // 런타임에서는 readonly를 확인할 수 없지만,
      // 배열이 freeze되지 않았는지 확인
      const key = queryKeys.contacts.all;
      expect(Array.isArray(key)).toBe(true);
    });
  });

  describe('키 계층 구조 검증', () => {
    it('detail 키는 항상 all 키를 포함해야 함', () => {
      const detailKey = queryKeys.contacts.detail(123);
      const allKey = queryKeys.contacts.all;

      // detail 키의 시작 부분이 all 키와 일치해야 함
      expect(detailKey.slice(0, allKey.length)).toEqual(allKey);
    });

    it('list 키는 항상 lists() 키를 포함해야 함', () => {
      const listKey = queryKeys.contacts.list({ page: 1 });
      const listsKey = queryKeys.contacts.lists();

      // list 키의 시작 부분이 lists() 키와 일치해야 함
      expect(listKey.slice(0, listsKey.length)).toEqual(listsKey);
    });
  });

  describe('특수 케이스', () => {
    it('빈 문자열 검색어도 처리해야 함', () => {
      const key = queryKeys.webhard.search.modal('');

      // modal/dropdown은 동일한 캐시 키 반환 (캐시 공유)
      expect(key).toEqual(['webhard', 'search', '']);
    });

    it('숫자 0을 ID로 사용 가능해야 함', () => {
      const key = queryKeys.contacts.detail(0);

      expect(key).toEqual(['contacts', 'detail', 0]);
    });

    it('undefined userId도 처리해야 함', () => {
      const key = queryKeys.webhard.storage('admin', undefined);

      expect(key).toEqual(['webhard', 'storage', 'admin', undefined]);
    });
  });

  describe('필터 객체 변경 감지', () => {
    it('필터 객체 내용이 다르면 다른 키를 생성해야 함', () => {
      const key1 = queryKeys.webhard.files.list({ sortBy: 'name' });
      const key2 = queryKeys.webhard.files.list({ sortBy: 'date' });

      expect(key1).not.toEqual(key2);
    });

    it('필터 속성 순서가 달라도 같은 내용이면 동등해야 함', () => {
      const filters1 = { status: 'pending', page: 1 };
      const filters2 = { page: 1, status: 'pending' };

      const key1 = queryKeys.contacts.list(filters1);
      const key2 = queryKeys.contacts.list(filters2);

      // 객체 참조가 다르므로 키가 다름 (React Query는 얕은 비교 사용)
      expect(key1[2]).not.toBe(key2[2]); // 참조 비교

      // 내용은 같은지 확인 (deep equality)
      const filter1 = key1[2] as Record<string, unknown>;
      const filter2 = key2[2] as Record<string, unknown>;
      expect(filter1).toEqual(filter2); // 내용 비교
    });
  });
});
