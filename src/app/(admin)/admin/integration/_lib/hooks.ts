'use client';

/**
 * 통합 관리 React Query 훅
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import {
  integrationOrderApi,
  integrationInventoryApi,
  integrationDeliveryApi,
  integrationProgramApi,
  integrationEventApi,
  integrationHealthApi,
  integrationWorkshopApi,
  integrationSyncLogApi,
  integrationOperationsApi,
} from './api';
import type {
  OrderFilters,
  CreateOrderRequest,
  CreateDeliveryRequest,
  StockAdjustmentRequest,
  WorkshopFilters,
} from './types';

// ============================================================
// 주문 훅
// ============================================================

export function useIntegrationStats() {
  return useQuery({
    queryKey: queryKeys.integration.stats(),
    queryFn: integrationOrderApi.getStats,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

export function useIntegrationOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: queryKeys.integration.orders.list(filters),
    queryFn: () => integrationOrderApi.getOrders(filters),
    staleTime: 30 * 1000,
  });
}

export function useIntegrationOrder(id: string) {
  return useQuery({
    queryKey: queryKeys.integration.orders.detail(id),
    queryFn: () => integrationOrderApi.getOrder(id),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

export function useOrderEvents(id: string) {
  return useQuery({
    queryKey: queryKeys.integration.orders.events(id),
    queryFn: () => integrationOrderApi.getOrderEvents(id),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

export function useOrderTimeline(id?: string | null) {
  return useQuery({
    queryKey: queryKeys.integration.orders.timeline(id),
    queryFn: () => integrationOrderApi.getOrderTimeline(id as string),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
    refetchInterval: 30000,
  });
}

export function useCreateOrderMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrderRequest) => integrationOrderApi.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.stats() });
    },
  });
}

export function useUpdateOrderStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      integrationOrderApi.updateOrderStatus(id, status),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.stats() });
    },
  });
}

// ============================================================
// 재고 훅
// ============================================================

export function useInventoryAlerts() {
  return useQuery({
    queryKey: queryKeys.integration.inventory.alerts(),
    queryFn: integrationInventoryApi.getAlerts,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useInventoryItems(category?: string) {
  return useQuery({
    queryKey: queryKeys.integration.inventory.items({ category }),
    queryFn: () => integrationInventoryApi.getItems(category),
    staleTime: 60 * 1000,
  });
}

export function useInventoryTransactions(itemId: string) {
  return useQuery({
    queryKey: queryKeys.integration.inventory.transactions(itemId),
    queryFn: () => integrationInventoryApi.getTransactions(itemId),
    enabled: Boolean(itemId),
    staleTime: 30 * 1000,
  });
}

export function useAdjustStockMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: StockAdjustmentRequest) => integrationInventoryApi.adjustStock(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.inventory.all() });
    },
  });
}

// ============================================================
// 납품 훅
// ============================================================

export function useDeliveries(status?: string) {
  return useQuery({
    queryKey: queryKeys.integration.deliveries.list({ status }),
    queryFn: () => integrationDeliveryApi.getDeliveries(status),
    staleTime: 30 * 1000,
  });
}

export function useDelivery(id: string) {
  return useQuery({
    queryKey: queryKeys.integration.deliveries.detail(id),
    queryFn: () => integrationDeliveryApi.getDelivery(id),
    enabled: Boolean(id),
    staleTime: 30 * 1000,
  });
}

export function useCreateDeliveryMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDeliveryRequest) => integrationDeliveryApi.createDelivery(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.deliveries.all() });
    },
  });
}

export function useUpdateDeliveryStatusMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      integrationDeliveryApi.updateDeliveryStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.deliveries.all() });
    },
  });
}

// ============================================================
// 프로그램 훅
// ============================================================

export function usePrograms() {
  return useQuery({
    queryKey: queryKeys.integration.programs.list(),
    queryFn: integrationProgramApi.getPrograms,
    staleTime: 15 * 1000,
    refetchInterval: 30 * 1000,
  });
}

// ============================================================
// API 상태 확인 훅
// ============================================================

export function useApiHealthCheck() {
  return useQuery({
    queryKey: queryKeys.integration.health(),
    queryFn: integrationHealthApi.checkAll,
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    retry: false,
  });
}

// ============================================================
// 이벤트 타임라인 훅
// ============================================================

export function useIntegrationEvents(limit?: number) {
  return useQuery({
    queryKey: queryKeys.integration.events.list({ limit }),
    queryFn: () => integrationEventApi.getEvents(limit),
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ============================================================
// 우선순위 변경 훅
// ============================================================

export function useUpdateOrderPriorityMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, priority }: { id: string; priority: 'urgent' | 'normal' | 'low' }) =>
      integrationOrderApi.updateOrderPriority(id, priority),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.orders.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.integration.workshop.all() });
    },
  });
}

// ============================================================
// Workshop 훅
// ============================================================

export function useWorkshopOrders(filters?: WorkshopFilters) {
  return useQuery({
    queryKey: queryKeys.integration.workshop.orders(filters),
    queryFn: () => integrationWorkshopApi.getOrders(filters),
    refetchInterval: 10000,
  });
}

// ============================================================
// SyncLog 훅
// ============================================================

export function useSyncLogStats(date?: string) {
  return useQuery({
    queryKey: queryKeys.integration.syncLogs.stats(date),
    queryFn: () => integrationSyncLogApi.getStats(date),
    refetchInterval: 30000,
  });
}

export function useSyncLogs(filters?: { status?: string; page?: number }) {
  return useQuery({
    queryKey: queryKeys.integration.syncLogs.list(filters),
    queryFn: () => integrationSyncLogApi.getLogs(filters),
  });
}

export function usePipelineBacklog(limit = 10) {
  return useQuery({
    queryKey: queryKeys.integration.syncLogs.pipelineBacklog(limit),
    queryFn: () => integrationSyncLogApi.getPipelineBacklog(limit),
    refetchInterval: 30000,
  });
}

// ============================================================
// Operations 훅
// ============================================================

export function useOperationFailures(limit = 20) {
  return useQuery({
    queryKey: queryKeys.integration.operations.failures({ limit }),
    queryFn: () => integrationOperationsApi.getFailures({ limit }),
    refetchInterval: 30000,
  });
}

export function useOperationHeartbeats() {
  return useQuery({
    queryKey: queryKeys.integration.operations.heartbeats(),
    queryFn: () => integrationOperationsApi.getHeartbeats(),
    refetchInterval: 30000,
  });
}
