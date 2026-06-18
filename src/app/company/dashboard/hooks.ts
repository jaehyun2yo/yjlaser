import { useMemo } from 'react';
import type { Contact, FilterType, StatusFilterType, DateFilter } from './types';
import { getDateRange, calculateStats, filterByStatus } from './utils';

/**
 * 필터링된 문의사항 훅 (날짜 필터 + 상태 필터)
 */
export const useFilteredContacts = (
  contacts: Contact[],
  filterType: FilterType,
  statusFilter: StatusFilterType = 'all',
  dateFilter?: DateFilter
) => {
  const filteredContacts = useMemo(() => {
    let dateFiltered = contacts;

    // DateFilter 우선 적용
    if (dateFilter?.startDate && dateFilter?.endDate) {
      dateFiltered = contacts.filter((contact) => {
        const contactDate = new Date(contact.created_at);
        return contactDate >= dateFilter.startDate! && contactDate <= dateFilter.endDate!;
      });
    } else if (filterType !== 'all') {
      const dateRange = getDateRange(filterType);
      if (dateRange) {
        dateFiltered = contacts.filter((contact) => {
          const contactDate = new Date(contact.created_at);
          return contactDate >= dateRange.start && contactDate <= dateRange.end;
        });
      }
    }

    return filterByStatus(dateFiltered, statusFilter);
  }, [contacts, filterType, statusFilter, dateFilter]);

  return filteredContacts;
};

/**
 * 통계 계산 훅
 */
export const useStats = (contacts: Contact[]) => {
  const stats = useMemo(() => calculateStats(contacts), [contacts]);
  return stats;
};
