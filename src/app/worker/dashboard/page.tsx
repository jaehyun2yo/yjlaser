'use client';

import {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  type KeyboardEvent,
  type UIEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useErpMobileStore } from '@/app/worker/_lib/store';
import {
  useStaffProcessContacts,
  useOfficeWorkerContacts,
  useUnclassifiedContacts,
} from '@/app/worker/_lib/hooks';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { toggleContactUrgent, addWorkerNote, deleteWorkerNoteAction } from '@/app/actions/contacts';
import { getDeliveredContacts, getWorkCategoryCounts } from '@/app/actions/process-board';
import StaffContactCard from '@/app/worker/_components/StaffContactCard';
import OfficeContactCard from '@/app/worker/_components/OfficeContactCard';
import { WorkerMemoModal } from '@/app/worker/_components/WorkerMemoModal';
import { WorkerContextMenu } from '@/app/worker/_components/WorkerContextMenu';
import { WorkerNewContactNotifications } from '@/app/worker/_components/WorkerNewContactNotifications';
import { WorkerScheduleMenu } from '@/app/worker/_components/WorkerScheduleMenu';
import { ConfirmModal } from '@/app/worker/_components/ConfirmModal';
import { SplitContactModal } from '@/app/(admin)/admin/contacts/_components/SplitContactModal';
import { ContactInfoModal } from '@/components/contact/ContactInfoModal';
import { formatWorkerInquiryNumbers } from '@/app/worker/_lib/formatWorkerContactMeta';
import { Search, Truck } from 'lucide-react';
import Link from 'next/link';
import type { ProcessStage } from '@/lib/utils/processStages';
import type { InquiryType } from '@/lib/types';
import type { Contact } from '@/lib/types/contact';
import { buildWorkerContactCardFilenameParts } from '@/lib/utils/contactDownloadFilename';
import QATestPanel from '@/app/worker/_components/QATestPanel';
import {
  createWorkerContactNotification,
  getWorkerNotificationTarget,
  isWorkerContactNotificationUnread,
  loadWorkerContactNotifications,
  markAllWorkerContactNotificationsRead,
  markWorkerContactNotificationRead,
  markWorkerContactNotificationsReadByContactId,
  mergeWorkerContactNotifications,
  orderWorkerContactNotificationsByReadState,
  pruneExpiredReadWorkerContactNotifications,
  saveWorkerContactNotifications,
  type WorkerContactNotification,
} from '@/app/worker/_lib/workerNotifications';

type MainTab = 'office' | 'field';
type OfficeSubFilter = ProcessStage | 'all' | 'unclassified';
type WorkerSearchResult = {
  contact: Contact;
  target:
    | { type: 'dashboard'; tab: MainTab; subFilter: OfficeSubFilter | ProcessStage | 'all' }
    | { type: 'delivery'; tab: 'pending' | 'completed' };
  sectionLabel: string;
  title: string;
  subtitle: string;
  numberLabel: string | null;
};
const CONTACT_LIST_BATCH_SIZE = 20;
const NOTIFICATION_HIGHLIGHT_DURATION_MS = 4500;
const WORKER_SEARCH_RESULT_BATCH_SIZE = 12;

// 탭·필터 active 색상 — main tab (사무실/현장) 과 sub-filter 가 같은 컬러를 공유
const ACTIVE_TAB_COLOR = {
  office: 'bg-info text-white',
  field: 'bg-brand text-white',
} as const;

// Sub-filter definitions
const OFFICE_SUB_FILTERS: Array<{ key: OfficeSubFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'unclassified', label: '미분류' },
  { key: null, label: '공정 시작전' },
  { key: 'drawing', label: '도면작업' },
  { key: 'sample', label: '샘플제작 및 확인' },
];

const FIELD_SUB_FILTERS: Array<{ key: ProcessStage | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'drawing_confirmed', label: '도면 확정 및 목형의뢰' },
  { key: 'laser', label: '레이저가공' },
  { key: 'cutting', label: '칼 작업' },
  { key: 'creasing', label: '오시작업' },
];

const FIELD_PROCESS_STAGES = new Set<ProcessStage>([
  'drawing_confirmed',
  'laser',
  'cutting',
  'creasing',
]);
const KOREAN_WEEKDAY_LABELS = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
] as const;

function getWorkerSearchText(contact: Contact): string {
  return [
    contact.company_name,
    contact.inquiry_number,
    contact.work_number,
    contact.inquiry_title,
    contact.drawing_file_name,
    contact.attachment_filename,
    contact.webhard_folder_path,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function getWorkerSearchResult(contact: Contact): WorkerSearchResult {
  const fileNameParts = buildWorkerContactCardFilenameParts({
    inquiryNumber: contact.inquiry_number,
    workNumber: contact.work_number,
    companyName: contact.company_name,
    fileName: contact.drawing_file_name,
  });
  const numberLabel = formatWorkerInquiryNumbers({
    inquiryNumber: contact.inquiry_number,
    workNumber: contact.work_number,
  });
  const subtitle = [numberLabel, contact.webhard_folder_path || contact.inquiry_title]
    .filter(Boolean)
    .join(' · ');

  if (contact.status === 'delivered') {
    return {
      contact,
      target: { type: 'delivery', tab: 'completed' },
      sectionLabel: '납품완료',
      title: `${fileNameParts.companyName} - ${fileNameParts.fileName}`,
      subtitle,
      numberLabel,
    };
  }

  if (contact.process_stage === 'delivery' && contact.status !== 'delivered') {
    return {
      contact,
      target: { type: 'delivery', tab: 'pending' },
      sectionLabel: '납품관리',
      title: `${fileNameParts.companyName} - ${fileNameParts.fileName}`,
      subtitle,
      numberLabel,
    };
  }

  if (FIELD_PROCESS_STAGES.has(contact.process_stage)) {
    return {
      contact,
      target: { type: 'dashboard', tab: 'field', subFilter: contact.process_stage },
      sectionLabel: '현장 작업',
      title: `${fileNameParts.companyName} - ${fileNameParts.fileName}`,
      subtitle,
      numberLabel,
    };
  }

  const subFilter: OfficeSubFilter =
    !contact.inquiry_type && contact.source === 'webhard'
      ? 'unclassified'
      : contact.process_stage === 'drawing' || contact.process_stage === 'sample'
        ? contact.process_stage
        : contact.process_stage === null
          ? null
          : 'all';

  return {
    contact,
    target: { type: 'dashboard', tab: 'office', subFilter },
    sectionLabel: '사무실 작업',
    title: `${fileNameParts.companyName} - ${fileNameParts.fileName}`,
    subtitle,
    numberLabel,
  };
}

function getWorkerClockLabels(date: Date): { dateLabel: string; timeLabel: string } {
  const year = String(date.getFullYear() % 100).padStart(2, '0');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdayLabel = KOREAN_WEEKDAY_LABELS[date.getDay()];
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours < 12 ? '오전' : '오후';
  const displayHour = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

  return {
    dateLabel: `${year}년 ${month}월 ${day}일 ${weekdayLabel}`,
    timeLabel: `${period} ${displayHour}시 ${minutes}분`,
  };
}

export default function WorkerDashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workerSession, _hydrated, logout } = useErpMobileStore();
  const queryClient = useQueryClient();

  // Main tab state - initialize from query param or workerType
  const getInitialTab = (): MainTab => {
    const tabParam = searchParams.get('tab');
    if (tabParam === 'office' || tabParam === 'field') return tabParam;
    if (workerSession?.workerType === 'office') return 'office';
    return 'field';
  };
  const [mainTab, setMainTab] = useState<MainTab>(getInitialTab);
  const getInitialSubFilter = (): OfficeSubFilter | ProcessStage | 'all' => {
    const wt = workerSession?.workerType;
    if (wt === 'laser' || wt === 'cutting') return wt;
    return 'all';
  };
  const [subFilter, setSubFilter] = useState<OfficeSubFilter | ProcessStage | 'all'>(
    getInitialSubFilter
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [memoContactId, setMemoContactId] = useState<string | null>(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [splitContactId, setSplitContactId] = useState<string | null>(null);
  const [infoContactId, setInfoContactId] = useState<string | null>(null);
  const [newContactNotifications, setNewContactNotifications] = useState<
    WorkerContactNotification[]
  >([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [pendingScrollContactId, setPendingScrollContactId] = useState<string | null>(null);
  const [highlightedContactId, setHighlightedContactId] = useState<string | null>(null);
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());
  const [visibleContactCount, setVisibleContactCount] = useState(CONTACT_LIST_BATCH_SIZE);
  const [visibleWorkerSearchResultCount, setVisibleWorkerSearchResultCount] = useState(
    WORKER_SEARCH_RESULT_BATCH_SIZE
  );
  const [activeWorkerSearchResultIndex, setActiveWorkerSearchResultIndex] = useState(-1);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);
  const workerSearchResultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const currentClockLabels = useMemo(
    () => getWorkerClockLabels(currentDateTime),
    [currentDateTime]
  );

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    contactId: string;
    x: number;
    y: number;
  } | null>(null);
  const deliveredSearchQuery = searchQuery.trim();
  const hasWorkerSearchQuery = deliveredSearchQuery.length > 0;
  const shouldFetchFieldContacts = mainTab === 'field' || hasWorkerSearchQuery;
  const shouldFetchOfficeContacts = mainTab === 'office' || hasWorkerSearchQuery;

  const { data: categoryCounts } = useQuery({
    queryKey: queryKeys.processBoard.categoryCounts(),
    queryFn: async () => {
      const result = await getWorkCategoryCounts();
      if (!result.success) throw new Error(result.error || '카운트 조회 실패');
      return result.data;
    },
    enabled: _hydrated && !!workerSession,
    staleTime: 30000,
  });

  // Data hooks — 첫 화면은 활성 탭만 조회하고, 통합 검색 중에는 필요한 목록을 확장 조회
  const {
    data: fieldContacts = [],
    isLoading: fieldLoading,
    isFetched: fieldFetched,
  } = useStaffProcessContacts({
    pollingEnabled: mainTab === 'field',
    enabled: shouldFetchFieldContacts,
  });
  const {
    data: officeOnlyContacts = [],
    isLoading: officeLoading,
    isFetched: officeFetched,
  } = useOfficeWorkerContacts({
    pollingEnabled: mainTab === 'office',
    enabled: shouldFetchOfficeContacts,
  });
  const {
    data: unclassifiedContacts = [],
    isLoading: unclassifiedLoading,
    isFetched: unclassifiedFetched,
  } = useUnclassifiedContacts({
    pollingEnabled: mainTab === 'office',
    enabled: shouldFetchOfficeContacts,
  });
  const { data: deliveredSearchData } = useQuery({
    queryKey: queryKeys.processBoard.delivered({ search: deliveredSearchQuery }),
    queryFn: async () => {
      const result = await getDeliveredContacts({ search: deliveredSearchQuery });
      if (!result.success) throw new Error(result.error || '납품 완료 검색 실패');
      return result.data ?? [];
    },
    enabled: _hydrated && !!workerSession && hasWorkerSearchQuery,
    staleTime: 30000,
  });
  const deliveredSearchContacts = deliveredSearchData ?? [];

  const initialDataReady =
    mainTab === 'field' ? fieldFetched : officeFetched && unclassifiedFetched;

  // 사무실 탭: office + unclassified 통합
  const officeContacts = useMemo(
    () => [...officeOnlyContacts, ...unclassifiedContacts],
    [officeOnlyContacts, unclassifiedContacts]
  );

  // 양 탭 통합 — 컨텍스트 메뉴/메모 모달 등 contactId 기반 조회용
  const allContacts = useMemo(
    () => [...fieldContacts, ...officeContacts, ...deliveredSearchContacts],
    [deliveredSearchContacts, fieldContacts, officeContacts]
  );
  const workerSearchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];

    const contactsById = new Map<string, Contact>();
    allContacts.forEach((contact) => {
      contactsById.set(contact.id, contact);
    });

    return Array.from(contactsById.values())
      .filter((contact) => getWorkerSearchText(contact).includes(query))
      .map(getWorkerSearchResult);
  }, [allContacts, searchQuery]);
  const visibleWorkerSearchResults = useMemo(
    () => workerSearchResults.slice(0, visibleWorkerSearchResultCount),
    [visibleWorkerSearchResultCount, workerSearchResults]
  );
  const hasMoreWorkerSearchResults = visibleWorkerSearchResultCount < workerSearchResults.length;

  useEffect(() => {
    setVisibleWorkerSearchResultCount(WORKER_SEARCH_RESULT_BATCH_SIZE);
    setActiveWorkerSearchResultIndex(workerSearchResults.length > 0 ? 0 : -1);
    workerSearchResultRefs.current = [];
  }, [searchQuery, workerSearchResults.length]);

  useEffect(() => {
    if (workerSearchResults.length === 0) return;
    setActiveWorkerSearchResultIndex((current) =>
      Math.min(Math.max(current, 0), workerSearchResults.length - 1)
    );
  }, [workerSearchResults.length]);

  useEffect(() => {
    if (activeWorkerSearchResultIndex < 0) return;
    workerSearchResultRefs.current[activeWorkerSearchResultIndex]?.scrollIntoView({
      block: 'nearest',
    });
  }, [activeWorkerSearchResultIndex, visibleWorkerSearchResultCount]);

  // Auth check — hydration 완료 후에만 판단
  useEffect(() => {
    if (_hydrated && !workerSession) router.push('/worker/login');
  }, [_hydrated, workerSession, router]);

  useEffect(() => {
    const updateCurrentDateTime = () => setCurrentDateTime(new Date());
    const now = new Date();
    const nextMinuteDelayMs = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    let intervalId: number | null = null;

    const timeoutId = window.setTimeout(() => {
      updateCurrentDateTime();
      intervalId = window.setInterval(updateCurrentDateTime, 60_000);
    }, nextMinuteDelayMs);

    return () => {
      window.clearTimeout(timeoutId);
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, []);

  const invalidateWorkerBoards = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.processBoard.board({ workCategory: 'field' }),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.processBoard.board({ workCategory: 'office' }),
    });
    queryClient.invalidateQueries({
      queryKey: queryKeys.processBoard.board({ workCategory: 'unclassified' }),
    });
  }, [queryClient]);

  useEffect(() => {
    setNewContactNotifications(
      pruneExpiredReadWorkerContactNotifications(
        loadWorkerContactNotifications(window.localStorage)
      )
    );
    setNotificationsHydrated(true);
  }, []);

  useEffect(() => {
    if (!notificationsHydrated) return;
    saveWorkerContactNotifications(window.localStorage, newContactNotifications);
  }, [newContactNotifications, notificationsHydrated]);

  const unreadNewContactNotificationIds = useMemo(
    () =>
      new Set(
        newContactNotifications
          .filter(isWorkerContactNotificationUnread)
          .map((notification) => notification.contactId)
      ),
    [newContactNotifications]
  );

  // Socket.IO realtime — 디바운스로 중복 refetch 방지
  // 현재 활성 탭의 workCategory 쿼리만 invalidate하는 타겟 함수
  const debouncedTargetedInvalidate = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fn = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        // 현재 활성 탭에 해당하는 쿼리만 invalidate
        if (mainTab === 'field') {
          queryClient.invalidateQueries({
            queryKey: queryKeys.processBoard.board({ workCategory: 'field' }),
          });
        } else {
          queryClient.invalidateQueries({
            queryKey: queryKeys.processBoard.board({ workCategory: 'office' }),
          });
          queryClient.invalidateQueries({
            queryKey: queryKeys.processBoard.board({ workCategory: 'unclassified' }),
          });
        }
        timer = null;
      }, 300);
    };
    fn.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return fn;
  }, [queryClient, mainTab]);

  // 전체 invalidation (새 건 추가/삭제/일괄 업데이트 — 부분 업데이트 어려움)
  const debouncedFullInvalidate = useMemo(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fn = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        invalidateWorkerBoards();
        timer = null;
      }, 300);
    };
    fn.cancel = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
    return fn;
  }, [invalidateWorkerBoards]);

  useEffect(() => {
    return () => {
      debouncedTargetedInvalidate.cancel();
      debouncedFullInvalidate.cancel();
    };
  }, [debouncedTargetedInvalidate, debouncedFullInvalidate]);

  const invalidateTimelineFromContactId = useCallback(
    (data: Record<string, unknown>) => {
      const contactId = data.id as string | number | undefined;
      if (contactId != null) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.contacts.timeline(contactId),
        });
      }
    },
    [queryClient]
  );

  const handleContactCreated = useCallback(
    (data: Record<string, unknown>) => {
      const notification = createWorkerContactNotification(data);
      if (notification) {
        setNewContactNotifications((current) =>
          mergeWorkerContactNotifications(current, [notification])
        );
      }
      invalidateWorkerBoards();
    },
    [invalidateWorkerBoards]
  );

  const socketEvents = useMemo(
    () => ({
      'contact:created': handleContactCreated,
      'contact:deleted': debouncedFullInvalidate,
      'contacts:batch_updated': debouncedFullInvalidate,
      'contact:updated': (data: Record<string, unknown>) => {
        invalidateTimelineFromContactId(data);
        debouncedTargetedInvalidate();
      },
      'contact:status_changed': (data: Record<string, unknown>) => {
        invalidateTimelineFromContactId(data);
        debouncedTargetedInvalidate();
      },
      'contact:process_stage_changed': (data: Record<string, unknown>) => {
        invalidateTimelineFromContactId(data);
        debouncedTargetedInvalidate();
      },
      'contact:drawing_revision_added': (data: Record<string, unknown>) => {
        const contactId = data.contactId as string | number | undefined;
        if (contactId != null) {
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.timeline(contactId),
          });
        }
        debouncedTargetedInvalidate();
      },
      'contact:group-stage-advanced': debouncedFullInvalidate,
      'contact:split': debouncedFullInvalidate,
    }),
    [
      debouncedFullInvalidate,
      debouncedTargetedInvalidate,
      handleContactCreated,
      invalidateTimelineFromContactId,
      queryClient,
    ]
  );

  useSocketNamespace({ namespace: 'contacts', events: socketEvents });

  // Reset sub-filter when switching main tabs
  const handleTabChange = (tab: MainTab) => {
    setMainTab(tab);
    setSubFilter('all');
    setSearchQuery('');
    setHighlightedContactId(null);
  };

  // Filtering — 현장작업 탭에서 납품 건은 제외 (납품관리 페이지에서만 관리)
  const displayFieldContacts = useMemo(
    () => fieldContacts.filter((c) => c.process_stage !== 'delivery'),
    [fieldContacts]
  );
  const currentContacts = mainTab === 'field' ? displayFieldContacts : officeContacts;
  const isLoading = mainTab === 'field' ? fieldLoading : officeLoading || unclassifiedLoading;

  const filteredContacts = useMemo(() => {
    let result = currentContacts;

    // Sub-filter
    if (subFilter === 'unclassified') {
      // 미분류: 외부웹하드 동기화 전용 (공개 폼 Contact 는 공정 시작 전으로 분류)
      result = result.filter((c) => !c.inquiry_type && c.source === 'webhard');
    } else if (subFilter === null) {
      // 공정 시작 전: 공개 폼 접수(source='website') 또는 분류 확정 Contact 모두 포함
      result = result.filter(
        (c) => c.process_stage === null && (c.source === 'website' || !!c.inquiry_type)
      );
    } else if (subFilter !== 'all') {
      // drawing / sample 등 단계 필터: 미분류 제외 (미분류 탭에서만 표시)
      result = result.filter((c) => c.process_stage === subFilter && !!c.inquiry_type);
    }

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((c) => getWorkerSearchText(c).includes(q));
    }

    return result;
  }, [currentContacts, subFilter, searchQuery]);

  useEffect(() => {
    setVisibleContactCount(CONTACT_LIST_BATCH_SIZE);
  }, [mainTab, subFilter, searchQuery]);

  const visibleContacts = useMemo(
    () => filteredContacts.slice(0, visibleContactCount),
    [filteredContacts, visibleContactCount]
  );
  const hasMoreContacts = visibleContactCount < filteredContacts.length;

  useEffect(() => {
    if (!hasMoreContacts) return undefined;
    const trigger = loadMoreTriggerRef.current;
    if (!trigger) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        setVisibleContactCount((current) =>
          Math.min(current + CONTACT_LIST_BATCH_SIZE, filteredContacts.length)
        );
      },
      { rootMargin: '600px 0px' }
    );

    observer.observe(trigger);

    return () => observer.disconnect();
  }, [filteredContacts.length, hasMoreContacts]);

  useEffect(() => {
    if (!pendingScrollContactId) return undefined;

    const targetIndex = filteredContacts.findIndex(
      (contact) => contact.id === pendingScrollContactId
    );
    if (targetIndex >= visibleContactCount) {
      setVisibleContactCount(
        Math.min(filteredContacts.length, targetIndex + CONTACT_LIST_BATCH_SIZE)
      );
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      const target = document.getElementById(`worker-contact-${pendingScrollContactId}`);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPendingScrollContactId(null);
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [filteredContacts, pendingScrollContactId, visibleContactCount]);

  useEffect(() => {
    if (!highlightedContactId) return undefined;

    const timeout = window.setTimeout(() => {
      setHighlightedContactId((current) => (current === highlightedContactId ? null : current));
    }, NOTIFICATION_HIGHLIGHT_DURATION_MS);

    return () => window.clearTimeout(timeout);
  }, [highlightedContactId]);

  const subFilters = mainTab === 'field' ? FIELD_SUB_FILTERS : OFFICE_SUB_FILTERS;

  const deliveryCount = useMemo(() => {
    return fieldContacts.filter((c) => c.process_stage === 'delivery' && c.status !== 'delivered')
      .length;
  }, [fieldContacts]);
  const officeTabCount =
    categoryCounts !== undefined
      ? categoryCounts.office + categoryCounts.unclassified
      : officeContacts.length;
  const fieldTabCount = categoryCounts?.field ?? displayFieldContacts.length;

  // Handlers
  const handleLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    router.push('/worker/login');
  };

  const handleOpenNewContactNotification = useCallback(
    (notification: WorkerContactNotification) => {
      const target = getWorkerNotificationTarget(notification);
      setMainTab(target.tab);
      setSubFilter(target.subFilter);
      setSearchQuery('');
      setPendingScrollContactId(notification.contactId);
      setHighlightedContactId(notification.contactId);
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
    },
    [queryClient]
  );

  const handleMarkNewContactNotificationRead = useCallback((notificationId: string) => {
    setNewContactNotifications((current) =>
      markWorkerContactNotificationRead(current, notificationId)
    );
  }, []);

  const handleMarkContactNotificationRead = useCallback((contactId: string) => {
    setNewContactNotifications((current) =>
      markWorkerContactNotificationsReadByContactId(current, contactId)
    );
  }, []);

  const handleWorkerSearchResultClick = useCallback(
    (result: WorkerSearchResult) => {
      setSearchQuery('');
      setActiveWorkerSearchResultIndex(-1);
      setVisibleWorkerSearchResultCount(WORKER_SEARCH_RESULT_BATCH_SIZE);
      handleMarkContactNotificationRead(result.contact.id);

      if (result.target.type === 'delivery') {
        const params = new URLSearchParams({
          tab: result.target.tab,
          highlight: result.contact.id,
        });
        if (result.target.tab === 'completed' && deliveredSearchQuery) {
          params.set('search', deliveredSearchQuery);
        }
        router.push(`/worker/delivery?${params.toString()}`);
        return;
      }

      setMainTab(result.target.tab);
      setSubFilter(result.target.subFilter);
      setPendingScrollContactId(result.contact.id);
      setHighlightedContactId(result.contact.id);
    },
    [deliveredSearchQuery, handleMarkContactNotificationRead, router]
  );

  const handleWorkerSearchKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (!hasWorkerSearchQuery || workerSearchResults.length === 0) return;

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveWorkerSearchResultIndex((current) => {
          const nextIndex = Math.min(current < 0 ? 0 : current + 1, workerSearchResults.length - 1);
          setVisibleWorkerSearchResultCount((visibleCount) =>
            Math.max(visibleCount, Math.min(workerSearchResults.length, nextIndex + 1))
          );
          return nextIndex;
        });
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveWorkerSearchResultIndex((current) =>
          current <= 0 ? 0 : Math.max(current - 1, 0)
        );
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        const targetIndex = activeWorkerSearchResultIndex >= 0 ? activeWorkerSearchResultIndex : 0;
        const result = workerSearchResults[targetIndex];
        if (result) handleWorkerSearchResultClick(result);
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        setSearchQuery('');
        setActiveWorkerSearchResultIndex(-1);
        setVisibleWorkerSearchResultCount(WORKER_SEARCH_RESULT_BATCH_SIZE);
      }
    },
    [
      activeWorkerSearchResultIndex,
      handleWorkerSearchResultClick,
      hasWorkerSearchQuery,
      workerSearchResults,
    ]
  );

  const handleWorkerSearchResultsScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      if (!hasMoreWorkerSearchResults) return;
      const target = event.currentTarget;
      const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;
      if (distanceToBottom > 80) return;
      setVisibleWorkerSearchResultCount((current) =>
        Math.min(current + WORKER_SEARCH_RESULT_BATCH_SIZE, workerSearchResults.length)
      );
    },
    [hasMoreWorkerSearchResults, workerSearchResults.length]
  );

  const handleMarkAllNewContactNotificationsRead = useCallback(() => {
    setNewContactNotifications((current) => markAllWorkerContactNotificationsRead(current));
  }, []);

  const handleCloseNewContactNotifications = useCallback(() => {
    setNewContactNotifications((current) =>
      orderWorkerContactNotificationsByReadState(
        pruneExpiredReadWorkerContactNotifications(current)
      )
    );
  }, []);

  // Context menu handlers
  const handleContextMenu = useCallback((contactId: string, x: number, y: number) => {
    setContextMenu({ contactId, x, y });
  }, []);

  const handleToggleUrgent = useCallback(async () => {
    if (!contextMenu) return;
    const result = await toggleContactUrgent(contextMenu.contactId);
    if (!result.success) {
      alert(result.error ?? '긴급 상태 변경에 실패했습니다.');
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: queryKeys.contacts.timeline(contextMenu.contactId),
      refetchType: 'all',
    });
    // 현재 활성 탭의 workCategory 쿼리만 invalidate
    if (mainTab === 'field') {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.processBoard.board({ workCategory: 'field' }),
      });
    } else {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.processBoard.board({ workCategory: 'office' }),
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.processBoard.board({ workCategory: 'unclassified' }),
      });
    }
    setContextMenu(null);
  }, [contextMenu, queryClient, mainTab]);

  const handleReclassify = useCallback(
    async (inquiryType: InquiryType) => {
      if (!contextMenu) return;
      const target = allContacts.find((c) => c.id === contextMenu.contactId);
      if (!target) return;
      handleMarkContactNotificationRead(contextMenu.contactId);

      // 재분류 시 status도 함께 변경되므로 received 외에는 confirm 경고
      if (target.status !== 'received') {
        const label = inquiryType === 'cutting_request' ? '칼선의뢰 → 도면작업' : '목형의뢰 → 컨펌';
        if (!confirm(`재분류 시 공정 상태도 함께 변경됩니다.\n(${label})\n진행하시겠습니까?`)) {
          return;
        }
      }

      const res = await fetch(`/api/contacts/${contextMenu.contactId}/inquiry-type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inquiry_type: inquiryType }),
      });

      if (!res.ok) {
        alert('재분류에 실패했습니다.');
        return;
      }

      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      setContextMenu(null);
    },
    [contextMenu, allContacts, queryClient, handleMarkContactNotificationRead]
  );

  // Memo handlers (multi-note)
  const handleAddNote = useCallback(
    async (data: { type: string; content: string }) => {
      if (memoContactId == null || !workerSession) return;
      const result = await addWorkerNote(memoContactId, {
        type: data.type,
        content: data.content,
        workerName: workerSession.name,
      });
      if (!result.success) {
        throw new Error(result.error || '노트 추가 실패');
      }
      // 현재 활성 탭의 workCategory 쿼리만 invalidate
      if (mainTab === 'field') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.board({ workCategory: 'field' }),
        });
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.board({ workCategory: 'office' }),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.board({ workCategory: 'unclassified' }),
        });
      }
    },
    [memoContactId, workerSession, queryClient, mainTab]
  );

  const handleDeleteNote = useCallback(
    async (noteId: number) => {
      if (memoContactId == null) return;
      const result = await deleteWorkerNoteAction(memoContactId, noteId);
      if (!result.success) {
        throw new Error(result.error || '노트 삭제 실패');
      }
      // 현재 활성 탭의 workCategory 쿼리만 invalidate
      if (mainTab === 'field') {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.board({ workCategory: 'field' }),
        });
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.board({ workCategory: 'office' }),
        });
        await queryClient.invalidateQueries({
          queryKey: queryKeys.processBoard.board({ workCategory: 'unclassified' }),
        });
      }
    },
    [memoContactId, queryClient, mainTab]
  );

  // Memo target contact (search across both)
  const memoContact = memoContactId ? allContacts.find((c) => c.id === memoContactId) : null;
  const contextMenuContact = contextMenu
    ? allContacts.find((c) => c.id === contextMenu.contactId)
    : null;

  if (!_hydrated || !workerSession || !initialDataReady) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {process.env.NODE_ENV !== 'production' && <QATestPanel />}
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 pt-4 pb-2">
          {/* Top bar: Name + Logout */}
          <div className="relative flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold text-gray-900">작업 현황</h1>
              <p className="text-sm text-gray-500">{workerSession.name} 님</p>
            </div>
            <time
              dateTime={currentDateTime.toISOString()}
              className="pointer-events-none absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-2xl border border-gray-200/80 bg-gray-50/90 px-5 py-1.5 text-center shadow-sm md:flex"
              aria-label="현재 시각"
            >
              <span className="whitespace-nowrap text-base font-bold tracking-tight text-gray-900">
                {currentClockLabels.dateLabel}
              </span>
              <span className="mt-0.5 whitespace-nowrap text-xs font-semibold text-gray-500">
                {currentClockLabels.timeLabel}
              </span>
            </time>
            <div className="flex items-center gap-2">
              <WorkerScheduleMenu />
              <WorkerNewContactNotifications
                notifications={newContactNotifications}
                onOpen={handleOpenNewContactNotification}
                onMarkRead={handleMarkNewContactNotificationRead}
                onMarkAllRead={handleMarkAllNewContactNotificationsRead}
                onClose={handleCloseNewContactNotifications}
                onClear={() => setNewContactNotifications([])}
              />
              <Link
                href="/worker/delivery"
                className="relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-600 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Truck className="w-4 h-4" />
                납품관리
                {deliveryCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 flex items-center justify-center px-1 text-[11px] font-bold text-white bg-red-500 rounded-full">
                    +{deliveryCount}
                  </span>
                )}
              </Link>
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                로그아웃
              </button>
            </div>
          </div>

          {/* Main tabs: office / field */}
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-3">
            <MainTabButton
              label="사무실 작업"
              count={officeTabCount}
              isActive={mainTab === 'office'}
              onClick={() => handleTabChange('office')}
              activeColor={ACTIVE_TAB_COLOR.office}
            />
            <MainTabButton
              label="현장 작업"
              count={fieldTabCount}
              isActive={mainTab === 'field'}
              onClick={() => handleTabChange('field')}
              activeColor={ACTIVE_TAB_COLOR.field}
            />
          </div>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="업체명, 문의번호, 패키지명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleWorkerSearchKeyDown}
              role="combobox"
              aria-expanded={hasWorkerSearchQuery}
              aria-controls={hasWorkerSearchQuery ? 'worker-search-results' : undefined}
              aria-activedescendant={
                activeWorkerSearchResultIndex >= 0
                  ? `worker-search-result-${activeWorkerSearchResultIndex}`
                  : undefined
              }
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent focus:bg-white transition"
            />
            {hasWorkerSearchQuery && (
              <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
                {workerSearchResults.length > 0 ? (
                  <div
                    id="worker-search-results"
                    role="listbox"
                    className="max-h-80 overflow-y-auto py-1"
                    onScroll={handleWorkerSearchResultsScroll}
                  >
                    {visibleWorkerSearchResults.map((result, index) => {
                      const isActive = index === activeWorkerSearchResultIndex;
                      const scopeClassName =
                        result.target.type === 'delivery'
                          ? 'bg-success-light text-success'
                          : result.target.tab === 'field'
                            ? 'bg-brand-light text-brand'
                            : 'bg-info-light text-info';

                      return (
                        <button
                          key={`${result.sectionLabel}-${result.contact.id}`}
                          id={`worker-search-result-${index}`}
                          ref={(node) => {
                            workerSearchResultRefs.current[index] = node;
                          }}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => handleWorkerSearchResultClick(result)}
                          onMouseEnter={() => setActiveWorkerSearchResultIndex(index)}
                          className={`flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors focus:outline-none ${
                            isActive ? 'bg-brand-light' : 'hover:bg-gray-50 focus:bg-gray-50'
                          }`}
                        >
                          <span
                            className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${scopeClassName}`}
                          >
                            {result.sectionLabel}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-gray-900">
                              {result.title}
                            </span>
                            {result.subtitle && (
                              <span className="mt-0.5 block truncate text-xs text-gray-500">
                                {result.subtitle}
                              </span>
                            )}
                          </span>
                          {result.numberLabel && (
                            <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-mono text-gray-500 sm:inline">
                              {result.numberLabel}
                            </span>
                          )}
                        </button>
                      );
                    })}
                    {hasMoreWorkerSearchResults && (
                      <div className="flex h-8 items-center justify-center" aria-hidden="true">
                        <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-brand" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="px-3 py-4 text-center text-sm text-gray-400">
                    검색 결과가 없습니다
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sub-filters */}
          <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
            {subFilters.map((filter) => {
              const count =
                filter.key === 'all'
                  ? currentContacts.length
                  : filter.key === 'unclassified'
                    ? currentContacts.filter((c) => !c.inquiry_type && c.source === 'webhard')
                        .length
                    : filter.key === null
                      ? currentContacts.filter(
                          (c) =>
                            c.process_stage === null && (c.source === 'website' || !!c.inquiry_type)
                        ).length
                      : currentContacts.filter(
                          (c) => c.process_stage === filter.key && !!c.inquiry_type
                        ).length;
              const isActive = subFilter === filter.key;
              return (
                <button
                  key={String(filter.key)}
                  onClick={() => setSubFilter(filter.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-full whitespace-nowrap transition-colors ${
                    isActive
                      ? ACTIVE_TAB_COLOR[mainTab]
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {filter.label} ({count})
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Count + Card list */}
      <div className="px-4 py-3">
        <p className="text-xs text-gray-500 mb-3 font-medium">총 {filteredContacts.length}건</p>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-brand"></div>
          </div>
        ) : filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">
              {searchQuery.trim() ? '검색 결과가 없습니다' : '진행 중인 작업이 없습니다'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleContacts.map((contact) =>
              mainTab === 'field' ? (
                <StaffContactCard
                  key={contact.id}
                  contact={contact}
                  onAdvance={() => {
                    handleMarkContactNotificationRead(contact.id);
                    setAdvancingId(contact.id);
                  }}
                  onAdvanceComplete={() => setAdvancingId(null)}
                  isAdvancing={advancingId === contact.id}
                  onMemo={(id) => setMemoContactId(id)}
                  onContextMenu={handleContextMenu}
                  onMarkNotificationRead={handleMarkContactNotificationRead}
                  hasNewContactNotification={unreadNewContactNotificationIds.has(contact.id)}
                  isNotificationHighlighted={highlightedContactId === contact.id}
                />
              ) : (
                <OfficeContactCard
                  key={contact.id}
                  contact={contact}
                  onAdvance={() => {
                    handleMarkContactNotificationRead(contact.id);
                    setAdvancingId(contact.id);
                  }}
                  onAdvanceComplete={() => setAdvancingId(null)}
                  isAdvancing={advancingId === contact.id}
                  onMemo={(id) => setMemoContactId(id)}
                  onContextMenu={handleContextMenu}
                  onMarkNotificationRead={handleMarkContactNotificationRead}
                  hasNewContactNotification={unreadNewContactNotificationIds.has(contact.id)}
                  isNotificationHighlighted={highlightedContactId === contact.id}
                />
              )
            )}
            {hasMoreContacts && (
              <div
                ref={loadMoreTriggerRef}
                className="flex h-10 items-center justify-center"
                aria-hidden="true"
              >
                <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-brand" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && contextMenuContact && (
        <WorkerContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          isUrgent={!!contextMenuContact.is_urgent}
          canSplit={
            contextMenuContact.parent_contact_id == null &&
            (contextMenuContact.split_count == null || contextMenuContact.split_count === 0) &&
            (contextMenuContact.process_stage == null ||
              contextMenuContact.process_stage === 'drawing' ||
              contextMenuContact.process_stage === 'drawing_confirmed')
          }
          currentInquiryType={contextMenuContact.inquiry_type}
          canReclassify={!!contextMenuContact.inquiry_type}
          webhardFolderId={contextMenuContact.webhard_folder_id}
          webhardFileId={contextMenuContact.webhard_file_id}
          onReclassify={handleReclassify}
          onToggleUrgent={handleToggleUrgent}
          onSplit={() => setSplitContactId(contextMenu.contactId)}
          onViewInfo={() => setInfoContactId(contextMenu.contactId)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 정보 보기 모달 */}
      {infoContactId &&
        (() => {
          const infoContact = allContacts.find((c) => c.id === infoContactId);
          if (!infoContact) return null;
          return (
            <ContactInfoModal
              contact={infoContact}
              open={true}
              onClose={() => setInfoContactId(null)}
            />
          );
        })()}

      {/* Memo Modal (multi-note) */}
      {memoContact && (
        <WorkerMemoModal
          contactId={memoContact.id}
          companyName={memoContact.company_name}
          existingNotes={memoContact.worker_notes ?? []}
          onClose={() => setMemoContactId(null)}
          onAdd={handleAddNote}
          onDelete={handleDeleteNote}
        />
      )}

      {/* Split Modal */}
      {splitContactId &&
        (() => {
          const splitContact = allContacts.find((c) => c.id === splitContactId);
          if (!splitContact) return null;
          return (
            <SplitContactModal
              contact={splitContact}
              isOpen={true}
              onClose={() => setSplitContactId(null)}
              onSuccess={() => {
                setSplitContactId(null);
                queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
              }}
            />
          );
        })()}

      {/* Logout Confirm */}
      <ConfirmModal
        isOpen={showLogoutConfirm}
        title="로그아웃"
        message="로그아웃 하시겠습니까?"
        type="confirm"
        confirmText="로그아웃"
        onConfirm={handleLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}

// Main tab button component
function MainTabButton({
  label,
  count,
  isActive,
  onClick,
  activeColor,
}: {
  label: string;
  count: number;
  isActive: boolean;
  onClick: () => void;
  activeColor: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
        isActive ? `${activeColor} shadow-sm` : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
      <span
        className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${
          isActive
            ? activeColor.includes('text-white')
              ? 'bg-white/20 text-white'
              : 'bg-gray-200 text-gray-700'
            : 'bg-gray-200 text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
