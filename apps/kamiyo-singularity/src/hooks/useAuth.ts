import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { api } from '@/lib/api';
import bs58 from 'bs58';
import { logger } from '@/lib/logger';

export function useAuth() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);

  // Restore session from httpOnly cookie on mount
  useEffect(() => {
    let mounted = true;
    api.restoreSession().then((restored) => {
      if (mounted) {
        setIsAuthenticated(restored);
        setSessionRestored(true);
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!connected && sessionRestored) {
      api.logout().then(() => setIsAuthenticated(false));
    }
  }, [connected, sessionRestored]);

  const login = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError('Wallet not connected');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const nonce = await api.getNonce();
      const timestamp = Math.floor(Date.now() / 1000);
      const wallet = publicKey.toBase58();
      const message = `kamiyo-singularity:${wallet}:${timestamp}:${nonce}`;

      const encoded = new TextEncoder().encode(message);
      const signature = await signMessage(encoded);
      const signatureBase58 = bs58.encode(signature);

      await api.login(wallet, signatureBase58, message);
      setIsAuthenticated(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed';
      setError(msg);
      logger.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, signMessage]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // Ignore logout errors
    }
    setIsAuthenticated(false);
    disconnect();
  }, [disconnect]);

  return {
    isAuthenticated,
    isLoading,
    error,
    login,
    logout,
    walletConnected: connected,
    walletAddress: publicKey?.toBase58(),
  };
}
