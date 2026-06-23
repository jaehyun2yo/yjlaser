const WEBHARD_QUERY_SCOPE = 'webhard';

/**
 * React Query 캐시 키 표준화 유틸리티
 * 일관된 쿼리 키 네이밍 컨벤션을 제공합니다.
 */

/**
 * 쿼리 키 팩토리 패턴
 * 각 도메인별로 쿼리 키를 생성하는 함수를 제공합니다.
 */
export const queryKeys = {
  /**
   * 문의(Contact) 관련 쿼리 키
   */
  contacts: {
    all: ['contacts'] as const,
    lists: () => [...queryKeys.contacts.all, 'list'] as const,
    list: (filters?: {
      status?: string;
      page?: number;
      search?: string;
      dateFilter?: string;
      inquiryTypeFilter?: string;
    }) => [...queryKeys.contacts.lists(), filters] as const,
    details: () => [...queryKeys.contacts.all, 'detail'] as const,
    detail: (id: number | string) => [...queryKeys.contacts.details(), id] as const,
    status: (id: number | string) => [...queryKeys.contacts.detail(id), 'status'] as const,
    timeline: (id: number | string) => [...queryKeys.contacts.detail(id), 'timeline'] as const,
    children: (parentId: number | string) =>
      [...queryKeys.contacts.all, parentId, 'children'] as const,
  },

  /**
   * 회사(Company) 관련 쿼리 키
   */
  companies: {
    all: ['companies'] as const,
    lists: () => [...queryKeys.companies.all, 'list'] as const,
    list: (filters?: { status?: string; page?: number }) =>
      [...queryKeys.companies.lists(), filters] as const,
    details: () => [...queryKeys.companies.all, 'detail'] as const,
    detail: (id: number | string) => [...queryKeys.companies.details(), id] as const,
    profile: (id: number | string) => [...queryKeys.companies.detail(id), 'profile'] as const,
  },

  /**
   * 폴더 별칭(CompanyFolderAlias) 관련 쿼리 키
   */
  folderAliases: {
    all: ['folderAliases'] as const,
    list: (status: 'pending' | 'approved' | 'rejected', page: number, pageSize: number) =>
      [...queryKeys.folderAliases.all, 'list', status, page, pageSize] as const,
  },

  /**
   * task 26: 미매칭 외부웹하드 폴더 (admin 매뉴얼 매핑 폼 후보)
   */
  externalUnmatchedFolders: {
    all: ['externalUnmatchedFolders'] as const,
    list: () => [...queryKeys.externalUnmatchedFolders.all, 'list'] as const,
  },

  /**
   * task 27 Phase C: 외부웹하드 husk 폴더 (빈 껍데기, 정리 대상)
   */
  externalHusks: {
    all: ['externalHusks'] as const,
    list: () => [...queryKeys.externalHusks.all, 'list'] as const,
  },

  /**
   * 포트폴리오 관련 쿼리 키
   */
  portfolio: {
    all: ['portfolio'] as const,
    lists: () => [...queryKeys.portfolio.all, 'list'] as const,
    list: (filters?: { tag?: string; page?: number }) =>
      [...queryKeys.portfolio.lists(), filters] as const,
    details: () => [...queryKeys.portfolio.all, 'detail'] as const,
    detail: (id: number | string) => [...queryKeys.portfolio.details(), id] as const,
  },

  /**
   * 게시물(Post) 관련 쿼리 키
   */
  posts: {
    all: ['posts'] as const,
    lists: () => [...queryKeys.posts.all, 'list'] as const,
    list: (filters?: { page?: number; category?: string }) =>
      [...queryKeys.posts.lists(), filters] as const,
    details: () => [...queryKeys.posts.all, 'detail'] as const,
    detail: (id: number | string) => [...queryKeys.posts.details(), id] as const,
  },

  /**
   * 대시보드 통계 관련 쿼리 키
   */
  dashboard: {
    all: ['dashboard'] as const,
    stats: () => [...queryKeys.dashboard.all, 'stats'] as const,
    contacts: {
      daily: () => [...queryKeys.dashboard.all, 'contacts', 'daily'] as const,
      status: () => [...queryKeys.dashboard.all, 'contacts', 'status'] as const,
      referral: () => [...queryKeys.dashboard.all, 'contacts', 'referral'] as const,
    },
    companies: {
      new: () => [...queryKeys.dashboard.all, 'companies', 'new'] as const,
    },
  },

  /**
   * 웹하드 관련 쿼리 키
   */
  webhard: {
    all: [WEBHARD_QUERY_SCOPE] as const,
    folders: {
      all: () => [...queryKeys.webhard.all, 'folders'] as const,
      list: (companyId?: number | string) =>
        [...queryKeys.webhard.folders.all(), companyId] as const,
      page: (parentId: string | null, companyId?: number | string) =>
        [...queryKeys.webhard.folders.all(), 'page', companyId ?? null, parentId] as const,
      children: (parentId: string | null) =>
        [...queryKeys.webhard.folders.all(), 'children', parentId] as const,
      ancestors: (folderId: string) =>
        [...queryKeys.webhard.folders.all(), 'ancestors', folderId] as const,
      undownloadedCount: (folderId: string) =>
        [...queryKeys.webhard.folders.all(), folderId, 'undownloaded-count'] as const,
      batchUndownloadedCount: (folderIds?: string[]) =>
        [...queryKeys.webhard.folders.all(), 'batch-undownloaded-count', folderIds] as const,
    },
    files: {
      all: () => [...queryKeys.webhard.all, 'files'] as const,
      list: (filters?: {
        folderId?: string;
        companyId?: number | string;
        search?: string;
        sortBy?: 'name' | 'date' | 'size';
        sortOrder?: 'asc' | 'desc';
      }) => [...queryKeys.webhard.files.all(), filters] as const,
      detail: (id: string) => [...queryKeys.webhard.files.all(), 'detail', id] as const,
    },
    logs: {
      all: () => [...queryKeys.webhard.all, 'logs'] as const,
      list: (filters?: { page?: number; limit?: number; action?: string; status?: string }) =>
        [...queryKeys.webhard.logs.all(), filters] as const,
    },
    totalUndownloadedCount: () => [...queryKeys.webhard.all, 'undownloaded-count'] as const,
    settings: () => [...queryKeys.webhard.all, 'settings'] as const,
    performance: () => [...queryKeys.webhard.all, 'performance'] as const,
    trash: {
      all: () => [...queryKeys.webhard.all, 'trash'] as const,
    },
    newFilesAll: () => [...queryKeys.webhard.files.all(), 'new'] as const,
    config: {
      all: () => [...queryKeys.webhard.all, 'config'] as const,
      statusMapping: () => [...queryKeys.webhard.config.all(), 'status-mapping'] as const,
      excludedFolders: () => [...queryKeys.webhard.config.all(), 'excluded-folders'] as const,
    },
    // 추가된 표준화 키
    badgeCounts: (options?: {
      companyId?: number | string | null;
      includeFolderCounts?: boolean;
    }) =>
      options
        ? ([
            ...queryKeys.webhard.all,
            'badge-counts',
            {
              companyId: options.companyId ?? null,
              includeFolderCounts: options.includeFolderCounts ?? true,
            },
          ] as const)
        : ([...queryKeys.webhard.all, 'badge-counts'] as const),
    newFiles: (companyId?: number | string) =>
      [...queryKeys.webhard.files.all(), 'new', companyId] as const,
    storageAll: () => [...queryKeys.webhard.all, 'storage'] as const,
    storage: (userType: string, userId?: string | number) =>
      [...queryKeys.webhard.storageAll(), userType, userId] as const,
    search: {
      all: () => [...queryKeys.webhard.all, 'search'] as const,
      byQuery: (query: string) => [...queryKeys.webhard.all, 'search', query] as const,
      // 하위호환: modal/dropdown 모두 동일한 캐시 키 반환 → 캐시 공유
      modal: (query: string) => [...queryKeys.webhard.all, 'search', query] as const,
      dropdown: (query: string) => [...queryKeys.webhard.all, 'search', query] as const,
    },
    shareLinks: {
      all: () => [...queryKeys.webhard.all, 'share-links'] as const,
      list: (companyId?: number | string) =>
        [...queryKeys.webhard.shareLinks.all(), 'list', companyId] as const,
      detail: (token: string) => [...queryKeys.webhard.shareLinks.all(), 'detail', token] as const,
    },
  },

  /**
   * 마이그레이션 관련 쿼리 키
   */
  migration: {
    all: ['migration'] as const,
    jobs: {
      all: () => [...queryKeys.migration.all, 'jobs'] as const,
      list: (filters?: { companyId?: number; status?: string }) =>
        [...queryKeys.migration.jobs.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.migration.jobs.all(), 'detail', id] as const,
    },
    logs: {
      all: () => [...queryKeys.migration.all, 'logs'] as const,
      byJob: (jobId: string) => [...queryKeys.migration.logs.all(), jobId] as const,
    },
    stats: () => [...queryKeys.migration.all, 'stats'] as const,
  },

  /**
   * 알림 관련 쿼리 키
   */
  notifications: {
    all: ['notifications'] as const,
    list: (filters?: {
      category?: string;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    }) =>
      filters
        ? ([...queryKeys.notifications.all, 'list', filters] as const)
        : ([...queryKeys.notifications.all, 'list'] as const),
    count: (category?: string) =>
      category && category !== 'all'
        ? ([...queryKeys.notifications.all, 'count', category] as const)
        : ([...queryKeys.notifications.all, 'count'] as const),
  },

  /**
   * 청구서 관련 쿼리 키
   */
  billing: {
    all: ['billing'] as const,
    invoices: {
      all: () => [...queryKeys.billing.all, 'invoices'] as const,
      list: (filters?: { status?: string; year?: string; page?: number }) =>
        [...queryKeys.billing.invoices.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.billing.invoices.all(), 'detail', id] as const,
    },
    settings: () => [...queryKeys.billing.all, 'settings'] as const,
  },

  /**
   * ERP 관련 쿼리 키
   */
  erp: {
    all: ['erp'] as const,
    contacts: {
      all: () => [...queryKeys.erp.all, 'contacts'] as const,
      list: (filters?: { status?: string; search?: string; processStages?: string[] }) =>
        [...queryKeys.erp.contacts.all(), 'list', filters] as const,
    },
    tasks: {
      all: () => [...queryKeys.erp.all, 'tasks'] as const,
      list: (filters?: {
        status?: string;
        priority?: string;
        taskType?: string;
        assignedTo?: string;
        page?: number;
      }) => [...queryKeys.erp.tasks.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.erp.tasks.all(), 'detail', id] as const,
      today: (workerName?: string) => [...queryKeys.erp.tasks.all(), 'today', workerName] as const,
      kanban: (filters?: { priority?: string; taskType?: string; assignedTo?: string }) =>
        [...queryKeys.erp.tasks.all(), 'kanban', filters] as const,
    },
    dashboard: {
      all: () => [...queryKeys.erp.all, 'dashboard'] as const,
      stats: () => [...queryKeys.erp.dashboard.all(), 'stats'] as const,
    },
    machines: {
      all: () => [...queryKeys.erp.all, 'machines'] as const,
      list: (activeOnly?: boolean) =>
        [...queryKeys.erp.machines.all(), 'list', activeOnly] as const,
      detail: (id: string) => [...queryKeys.erp.machines.all(), 'detail', id] as const,
    },
    workers: {
      all: () => [...queryKeys.erp.all, 'workers'] as const,
      list: (activeOnly?: boolean) => [...queryKeys.erp.workers.all(), 'list', activeOnly] as const,
      detail: (id: string) => [...queryKeys.erp.workers.all(), 'detail', id] as const,
    },
    accessLogs: {
      all: () => [...queryKeys.erp.all, 'accessLogs'] as const,
      list: (filters?: { workerId?: string; ipAddress?: string; action?: string; page?: number }) =>
        [...queryKeys.erp.accessLogs.all(), 'list', filters] as const,
      stats: () => [...queryKeys.erp.accessLogs.all(), 'stats'] as const,
    },
  },

  /**
   * 공정 보드 관련 쿼리 키
   */
  processBoard: {
    all: ['processBoard'] as const,
    board: (filters?: {
      companyName?: string;
      dateFilter?: string;
      workCategory?: string;
      stageFilter?: string;
      limit?: number;
    }) => ['processBoard', 'board', filters] as const,
    delivered: (filters?: {
      dateFrom?: string;
      dateTo?: string;
      search?: string;
      companyNames?: string[];
    }) => ['processBoard', 'delivered', filters] as const,
    deliveredCompanies: () => ['processBoard', 'delivered-companies'] as const,
    categoryCounts: () => [...queryKeys.processBoard.all, 'category-counts'] as const,
  },

  /**
   * 예약(Booking) 관련 쿼리 키
   */
  bookings: {
    all: ['bookings'] as const,
    list: (filters?: { date?: string; status?: string }) =>
      [...queryKeys.bookings.all, 'list', filters] as const,
    detail: (id: number | string) => [...queryKeys.bookings.all, 'detail', id] as const,
    workerUpcoming: () => [...queryKeys.bookings.all, 'worker-upcoming'] as const,
  },

  /**
   * 시스템 관리 관련 쿼리 키
   */
  system: {
    all: ['system'] as const,
    activityLogs: (filters?: { page?: number; actionFilter?: string; actorFilter?: string }) =>
      [...queryKeys.system.all, 'activity-logs', filters] as const,
    performance: () => [...queryKeys.system.all, 'performance'] as const,
  },

  /**
   * 동기화 모니터 관련 쿼리 키
   */
  sync: {
    all: ['sync'] as const,
    status: () => [...queryKeys.sync.all, 'status'] as const,
    stats: () => [...queryKeys.sync.all, 'stats'] as const,
    events: (filters?: { limit?: number }) => [...queryKeys.sync.all, 'events', filters] as const,
  },

  /**
   * 통합 시스템(Integration) 관련 쿼리 키
   */
  integration: {
    all: ['integration'] as const,
    orders: {
      all: () => [...queryKeys.integration.all, 'orders'] as const,
      list: (filters?: { contactId?: number; status?: string; page?: number; limit?: number }) =>
        [...queryKeys.integration.orders.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.integration.orders.all(), 'detail', id] as const,
      events: (id: string) => [...queryKeys.integration.orders.all(), id, 'events'] as const,
      timeline: (id?: string | null) =>
        [...queryKeys.integration.orders.all(), id ?? null, 'timeline'] as const,
    },
    stats: () => [...queryKeys.integration.all, 'stats'] as const,
    programs: {
      all: () => [...queryKeys.integration.all, 'programs'] as const,
      list: () => [...queryKeys.integration.all, 'programs', 'list'] as const,
    },
    inventory: {
      all: () => [...queryKeys.integration.all, 'inventory'] as const,
      items: (filters?: { category?: string; isActive?: boolean }) =>
        [...queryKeys.integration.all, 'inventory', 'items', filters] as const,
      detail: (id: string) => [...queryKeys.integration.all, 'inventory', 'detail', id] as const,
      transactions: (itemId: string) =>
        [...queryKeys.integration.all, 'inventory', 'transactions', itemId] as const,
      alerts: () => [...queryKeys.integration.all, 'inventory', 'alerts'] as const,
    },
    deliveries: {
      all: () => [...queryKeys.integration.all, 'deliveries'] as const,
      list: (filters?: { status?: string; orderId?: string; page?: number }) =>
        [...queryKeys.integration.all, 'deliveries', 'list', filters] as const,
      detail: (id: string) => [...queryKeys.integration.all, 'deliveries', 'detail', id] as const,
      schedule: (dateFrom?: string, dateTo?: string) =>
        [...queryKeys.integration.all, 'deliveries', 'schedule', dateFrom, dateTo] as const,
    },
    events: {
      all: () => [...queryKeys.integration.all, 'events'] as const,
      list: (filters?: { source?: string; eventType?: string; limit?: number }) =>
        [...queryKeys.integration.all, 'events', 'list', filters] as const,
    },
    workshop: {
      all: () => [...queryKeys.integration.all, 'workshop'] as const,
      orders: (filters?: { stage?: string; period?: string; search?: string }) =>
        [...queryKeys.integration.all, 'workshop', 'orders', filters] as const,
    },
    syncLogs: {
      all: () => [...queryKeys.integration.all, 'sync-logs'] as const,
      list: (filters?: { status?: string; page?: number }) =>
        [...queryKeys.integration.all, 'sync-logs', 'list', filters] as const,
      stats: (date?: string) => [...queryKeys.integration.all, 'sync-logs', 'stats', date] as const,
      pipelineBacklog: (limit?: number) =>
        [...queryKeys.integration.all, 'sync-logs', 'pipeline-backlog', limit] as const,
    },
    operations: {
      all: () => [...queryKeys.integration.all, 'operations'] as const,
      failures: (filters?: { cursor?: string; limit?: number }) =>
        [...queryKeys.integration.all, 'operations', 'failures', filters] as const,
      heartbeats: () => [...queryKeys.integration.all, 'operations', 'heartbeats'] as const,
    },
    health: () => [...queryKeys.integration.all, 'health'] as const,
  },

  /**
   * 백업 관련 쿼리 키
   */
  backup: {
    all: ['backup'] as const,
    settings: () => [...queryKeys.backup.all, 'settings'] as const,
    eligible: () => [...queryKeys.backup.all, 'eligible'] as const,
    status: () => [...queryKeys.backup.all, 'status'] as const,
    history: (page: number) => [...queryKeys.backup.all, 'history', page] as const,
  },

  /**
   * 작업자(Worker) 관련 쿼리 키
   */
  worker: {
    all: ['worker'] as const,
    session: () => [...queryKeys.worker.all, 'session'] as const,
    tasks: {
      all: () => [...queryKeys.worker.all, 'tasks'] as const,
      today: () => [...queryKeys.worker.tasks.all(), 'today'] as const,
      list: (filters?: { status?: string }) =>
        [...queryKeys.worker.tasks.all(), 'list', filters] as const,
      detail: (id: string) => [...queryKeys.worker.tasks.all(), 'detail', id] as const,
    },
    postProcessing: {
      all: () => [...queryKeys.worker.all, 'post-processing'] as const,
      list: () => [...queryKeys.worker.postProcessing.all(), 'list'] as const,
      detail: (id: string) => [...queryKeys.worker.postProcessing.all(), 'detail', id] as const,
    },
    delivery: {
      all: () => [...queryKeys.worker.all, 'delivery'] as const,
      list: () => [...queryKeys.worker.delivery.all(), 'list'] as const,
    },
  },
} as const;

/**
 * 쿼리 키 타입 추출 헬퍼
 */
export type QueryKey = typeof queryKeys;
