/**
 * useWebSocket Hook
 * React hook for managing WebSocket connection and receiving updates
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getWebSocketService } from '@/services/websocket';
import { useAuthStore, useWebSocket as useWebSocketStore } from '@/store/appStore';
import { Exploit, WebSocketMessage } from '@/types';

interface UseWebSocketOptions {
  autoConnect?: boolean;
  onExploit?: (exploit: Exploit) => void;
  onStatusChange?: (status: string) => void;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const { autoConnect = true, onExploit, onStatusChange } = options;
  const { token } = useAuthStore();
  const {
    setWebSocketConnected,
    setWebSocketReconnecting,
    setWebSocketError,
  } = useWebSocketStore();

  const wsRef = useRef(getWebSocketService(token || undefined));

  useEffect(() => {
    const ws = wsRef.current;

    // Connection handler
    const unsubscribeConnection = ws.onConnectionChange((connected) => {
      setWebSocketConnected(connected);
      if (connected) {
        setWebSocketReconnecting(false);
      }
    });

    // Message handler
    const unsubscribeMessage = ws.onMessage((message) => {
      switch (message.type) {
        case 'exploit':
          if (onExploit && message.data) {
            onExploit(message.data);
          }
          break;
        case 'status':
          if (onStatusChange && message.data) {
            onStatusChange(message.data);
          }
          break;
        case 'error':
          setWebSocketError(message.data?.message || 'Unknown error');
          break;
      }
    });

    // Error handler
    const unsubscribeError = ws.onError((error) => {
      setWebSocketError(error);
    });

    // Auto-connect
    if (autoConnect && token) {
      ws.connect();
    }

    // Cleanup
    return () => {
      unsubscribeConnection();
      unsubscribeMessage();
      unsubscribeError();
      if (autoConnect) {
        ws.disconnect();
      }
    };
  }, [token, autoConnect]);

  const connect = useCallback(() => {
    wsRef.current.connect();
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current.disconnect();
  }, []);

  const send = useCallback((message: any) => {
    wsRef.current.send(message);
  }, []);

  return {
    connect,
    disconnect,
    send,
    isConnected: wsRef.current.isConnected(),
  };
};

/**
 * Hook specifically for exploit updates
 */
export const useWebSocketExploits = () => {
  const [latestExploit, setLatestExploit] = useState<Exploit | null>(null);

  useWebSocket({
    autoConnect: true,
    onExploit: (exploit) => {
      setLatestExploit(exploit);
    },
  });

  return latestExploit;
};

export default useWebSocket;
