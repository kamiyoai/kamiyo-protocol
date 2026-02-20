import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ClearUserLockConfigRequest,
  FundryStakingV2Client,
  GetUserLockConfigResponse,
  SetUserLockConfigRequest,
  SubmitSignedTxResponse,
  UnstakeV2Request,
  WalletSigner,
} from './client';

type AsyncState<T> = {
  loading: boolean;
  error: string | null;
  data: T | null;
};

function useAsyncState<T>(initialData: T | null = null): [AsyncState<T>, (patch: Partial<AsyncState<T>>) => void] {
  const [state, setState] = useState<AsyncState<T>>({
    loading: false,
    error: null,
    data: initialData,
  });

  const patch = useCallback((value: Partial<AsyncState<T>>) => {
    setState(prev => ({ ...prev, ...value }));
  }, []);

  return [state, patch];
}

export function useUserLockConfig(params: {
  client: FundryStakingV2Client;
  poolAddress: string | null;
  walletAddress: string | null;
  enabled?: boolean;
}) {
  const { client, poolAddress, walletAddress, enabled = true } = params;
  const [state, patch] = useAsyncState<GetUserLockConfigResponse>();

  const load = useCallback(async () => {
    if (!enabled || !poolAddress || !walletAddress) return;
    patch({ loading: true, error: null });
    try {
      const data = await client.getUserLockConfig({ poolAddress, wallet: walletAddress });
      patch({ data, loading: false });
    } catch (error) {
      patch({ error: error instanceof Error ? error.message : String(error), loading: false });
    }
  }, [client, enabled, poolAddress, walletAddress, patch]);

  useEffect(() => {
    void load();
  }, [load]);

  return useMemo(
    () => ({
      ...state,
      refresh: load,
    }),
    [state, load]
  );
}

export function useStakingV2Actions(params: {
  client: FundryStakingV2Client;
  wallet: WalletSigner | null;
  poolAddress: string | null;
}) {
  const { client, wallet, poolAddress } = params;
  const [state, patch] = useAsyncState<SubmitSignedTxResponse>();

  const requireWallet = useCallback((): WalletSigner => {
    if (!wallet) throw new Error('Wallet not connected');
    return wallet;
  }, [wallet]);

  const requirePool = useCallback((): string => {
    if (!poolAddress) throw new Error('Pool not selected');
    return poolAddress;
  }, [poolAddress]);

  const setUserLockConfig = useCallback(
    async (cooldownSeconds: number) => {
      patch({ loading: true, error: null });
      try {
        const signer = requireWallet();
        const pool = requirePool();
        const payload: SetUserLockConfigRequest = {
          wallet: signer.publicKey.toBase58(),
          poolAddress: pool,
          cooldownSeconds,
        };
        const prepared = await client.prepareSetUserLockConfig(payload);
        const submitted = await client.signAndSubmitTx(prepared.transaction, signer);
        patch({ loading: false, data: submitted });
        return submitted;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        patch({ loading: false, error: message });
        throw error;
      }
    },
    [client, patch, requirePool, requireWallet]
  );

  const clearUserLockConfig = useCallback(async () => {
    patch({ loading: true, error: null });
    try {
      const signer = requireWallet();
      const pool = requirePool();
      const payload: ClearUserLockConfigRequest = {
        wallet: signer.publicKey.toBase58(),
        poolAddress: pool,
      };
      const prepared = await client.prepareClearUserLockConfig(payload);
      const submitted = await client.signAndSubmitTx(prepared.transaction, signer);
      patch({ loading: false, data: submitted });
      return submitted;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      patch({ loading: false, error: message });
      throw error;
    }
  }, [client, patch, requirePool, requireWallet]);

  const unstakeV2 = useCallback(
    async (amountRaw: string) => {
      patch({ loading: true, error: null });
      try {
        const signer = requireWallet();
        const pool = requirePool();
        const payload: UnstakeV2Request = {
          wallet: signer.publicKey.toBase58(),
          poolAddress: pool,
          amountRaw,
        };
        const prepared = await client.prepareUnstakeV2(payload);
        const submitted = await client.signAndSubmitTx(prepared.transaction, signer);
        patch({ loading: false, data: submitted });
        return {
          prepared,
          submitted,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        patch({ loading: false, error: message });
        throw error;
      }
    },
    [client, patch, requirePool, requireWallet]
  );

  return {
    ...state,
    setUserLockConfig,
    clearUserLockConfig,
    unstakeV2,
  };
}
