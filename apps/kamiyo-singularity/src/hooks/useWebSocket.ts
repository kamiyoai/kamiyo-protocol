import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Outcome } from '@/types';
import { logger } from '@/lib/logger';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';

type MessageHandler = (data: unknown) => void;

interface WebSocketMessage {
  type: string;
  data: unknown;
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlersRef = useRef<Map<string, Set<MessageHandler>>>(new Map());
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      wsRef.current = new WebSocket(WS_URL);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      wsRef.current.onerror = () => {
        setError('WebSocket connection failed');
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          const handlers = handlersRef.current.get(message.type);
          if (handlers) {
            handlers.forEach((handler) => handler(message.data));
          }
        } catch {
          logger.error('Failed to parse WebSocket message');
        }
      };
    } catch {
      setError('Failed to connect to WebSocket');
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
  }, []);

  const subscribe = useCallback((type: string, handler: MessageHandler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);

    return () => {
      handlersRef.current.get(type)?.delete(handler);
    };
  }, []);

  const send = useCallback((type: string, data: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, data }));
    }
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return { isConnected, error, subscribe, send, connect, disconnect };
}

export function useOrderBookSubscription(marketId: string, outcome: Outcome) {
  const queryClient = useQueryClient();
  const { subscribe, send, isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !marketId) return;

    // Subscribe to order book updates
    send('subscribe', { channel: 'orderbook', marketId, outcome });

    const unsubscribe = subscribe('orderbook_update', (data) => {
      const update = data as { marketId: string; outcome: Outcome };
      if (update.marketId === marketId && update.outcome === outcome) {
        queryClient.invalidateQueries({
          queryKey: ['orderbook', marketId, outcome],
        });
      }
    });

    return () => {
      send('unsubscribe', { channel: 'orderbook', marketId, outcome });
      unsubscribe();
    };
  }, [isConnected, marketId, outcome, subscribe, send, queryClient]);
}

export function useTradeSubscription(marketId: string) {
  const queryClient = useQueryClient();
  const { subscribe, send, isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !marketId) return;

    send('subscribe', { channel: 'trades', marketId });

    const unsubscribe = subscribe('trade', (data) => {
      const trade = data as { marketId: string };
      if (trade.marketId === marketId) {
        queryClient.invalidateQueries({ queryKey: ['trades', marketId] });
        queryClient.invalidateQueries({ queryKey: ['market', marketId] });
      }
    });

    return () => {
      send('unsubscribe', { channel: 'trades', marketId });
      unsubscribe();
    };
  }, [isConnected, marketId, subscribe, send, queryClient]);
}

export function usePriceSubscription(marketId: string) {
  const queryClient = useQueryClient();
  const { subscribe, send, isConnected } = useWebSocket();

  useEffect(() => {
    if (!isConnected || !marketId) return;

    send('subscribe', { channel: 'prices', marketId });

    const unsubscribe = subscribe('price_update', (data) => {
      const update = data as { marketId: string };
      if (update.marketId === marketId) {
        queryClient.invalidateQueries({ queryKey: ['market', marketId] });
      }
    });

    return () => {
      send('unsubscribe', { channel: 'prices', marketId });
      unsubscribe();
    };
  }, [isConnected, marketId, subscribe, send, queryClient]);
}
