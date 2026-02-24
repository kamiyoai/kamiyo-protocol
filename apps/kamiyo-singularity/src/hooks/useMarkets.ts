import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { fetchAllMarkets, fetchMarket } from '@/lib/solana';
import { mockMarkets } from '@/lib/mockData';
import type { MarketFilters, Outcome, PaginatedResponse, Market } from '@/types';

type DataSource = 'mock' | 'chain' | 'api';

const DATA_SOURCE: DataSource = (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || 'mock';

export function useMarkets(filters?: MarketFilters) {
  return useQuery({
    queryKey: ['markets', filters, DATA_SOURCE],
    queryFn: async (): Promise<PaginatedResponse<Market>> => {
      let data: Market[];

      if (DATA_SOURCE === 'chain') {
        data = await fetchAllMarkets();
      } else if (DATA_SOURCE === 'api') {
        return api.getMarkets(filters);
      } else {
        data = [...mockMarkets];
      }

      if (filters?.category) {
        data = data.filter(m => m.category.toLowerCase() === filters.category?.toLowerCase());
      }

      if (filters?.sort === 'volume') {
        data.sort((a, b) => b.volume24h - a.volume24h);
      } else if (filters?.sort === 'ending') {
        data.sort((a, b) => new Date(a.tradingEnd).getTime() - new Date(b.tradingEnd).getTime());
      }

      const limit = filters?.limit || 50;
      const offset = filters?.offset || 0;

      return {
        data: data.slice(offset, offset + limit),
        total: data.length,
        limit,
        offset,
        hasMore: offset + limit < data.length,
      };
    },
  });
}

export function useMarket(id: string) {
  return useQuery({
    queryKey: ['market', id, DATA_SOURCE],
    queryFn: async () => {
      if (DATA_SOURCE === 'chain') {
        const market = await fetchMarket(id);
        if (!market) throw new Error('Market not found');
        return market;
      } else if (DATA_SOURCE === 'api') {
        return api.getMarket(id);
      } else {
        const market = mockMarkets.find(m => m.id === id);
        if (!market) throw new Error('Market not found');
        return market;
      }
    },
    enabled: !!id,
    retry: 1,
    staleTime: 30000,
  });
}

export function useOrderBook(marketId: string, outcome: Outcome) {
  return useQuery({
    queryKey: ['orderbook', marketId, outcome, DATA_SOURCE],
    queryFn: async () => {
      if (DATA_SOURCE === 'mock' || DATA_SOURCE === 'chain') {
        // For chain mode, return empty orderbook until on-chain orderbook is implemented
        return {
          marketId,
          outcome,
          bids: [],
          asks: [],
          lastUpdate: new Date().toISOString(),
        };
      }
      return api.getOrderBook(marketId, outcome);
    },
    enabled: !!marketId,
    refetchInterval: DATA_SOURCE === 'api' ? 5000 : false,
  });
}

export function useTrades(
  marketId: string,
  params?: { outcome?: Outcome; limit?: number }
) {
  return useQuery({
    queryKey: ['trades', marketId, params, DATA_SOURCE],
    queryFn: async () => {
      if (DATA_SOURCE === 'mock') {
        return { data: [], total: 0, limit: 20, offset: 0, hasMore: false };
      }
      // TODO: Implement on-chain trade history fetching
      return api.getTrades(marketId, params);
    },
    enabled: !!marketId,
  });
}
