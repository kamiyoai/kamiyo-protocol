import { useWalletStore } from '../stores/wallet';
import { shortenAddress, formatSol, solToUsd, formatUsd } from '../lib/solana';

export function useWallet() {
  const store = useWalletStore();

  const address = store.publicKey?.toBase58() || null;
  const shortAddress = address ? shortenAddress(address) : null;
  const formattedBalance = formatSol(store.balance);
  const usdBalance = solToUsd(store.balance);
  const formattedUsdBalance = formatUsd(usdBalance);

  return {
    ...store,
    address,
    shortAddress,
    formattedBalance,
    usdBalance,
    formattedUsdBalance,
  };
}
