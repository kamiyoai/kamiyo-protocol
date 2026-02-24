import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { mockPositions } from '@/lib/mockData';
import type { PaginatedResponse, Position } from '@/types';

const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === 'true' || true;

export function usePositions() {
  return useQuery({
    queryKey: ['positions'],
    queryFn: async (): Promise<PaginatedResponse<Position>> => {
      if (USE_MOCK) {
        return {
          data: mockPositions,
          total: mockPositions.length,
          limit: 50,
          offset: 0,
          hasMore: false,
        };
      }
      return api.getPositions();
    },
    enabled: USE_MOCK || api.isAuthenticated(),
  });
}

export function usePosition(marketId: string) {
  return useQuery({
    queryKey: ['position', marketId],
    queryFn: async () => {
      if (USE_MOCK) {
        return mockPositions.find(p => p.marketId === marketId) || null;
      }
      return api.getPosition(marketId);
    },
    enabled: !!marketId && (USE_MOCK || api.isAuthenticated()),
  });
}

export function useClaimWinnings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (marketId: string) => api.claimWinnings(marketId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['positions'] });
    },
  });
}
