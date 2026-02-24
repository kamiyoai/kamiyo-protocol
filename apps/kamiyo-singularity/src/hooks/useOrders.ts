import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { mockOrders } from '@/lib/mockData';
import type { OrderFilters, PlaceOrderRequest, PlaceOrderResponse, PaginatedResponse, Order } from '@/types';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true' || true;

export function useOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: async (): Promise<PaginatedResponse<Order>> => {
      if (USE_MOCK) {
        let data = [...mockOrders];
        if (filters?.status) {
          data = data.filter(o => o.status === filters.status);
        }
        if (filters?.marketId) {
          data = data.filter(o => o.marketId === filters.marketId);
        }
        return {
          data,
          total: data.length,
          limit: 50,
          offset: 0,
          hasMore: false,
        };
      }
      return api.getOrders(filters);
    },
    enabled: USE_MOCK || api.isAuthenticated(),
  });
}

export function useOrder(orderId: string) {
  return useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      if (USE_MOCK) {
        return mockOrders.find(o => o.id === orderId) || null;
      }
      return api.getOrder(orderId);
    },
    enabled: !!orderId && (USE_MOCK || api.isAuthenticated()),
  });
}

export function usePlaceOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: PlaceOrderRequest): Promise<PlaceOrderResponse> => {
      if (USE_MOCK) {
        await new Promise(resolve => setTimeout(resolve, 500));
        return {
          orderId: `ord-${Date.now()}`,
          status: 'open',
        };
      }
      return api.placeOrder(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['positions'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orderId: string) => {
      if (USE_MOCK) {
        await new Promise(resolve => setTimeout(resolve, 300));
        return { success: true };
      }
      return api.cancelOrder(orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orderbook'] });
    },
  });
}
