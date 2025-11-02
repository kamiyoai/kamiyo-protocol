// components/TokenData.js
import { useState, useEffect } from 'react';
import { Connection, PublicKey } from '@solana/web3.js';

export function useTokenData(mintAddress) {
  const [tokenData, setTokenData] = useState({
    ca: mintAddress || 'Waiting for API response...',
    marketCap: 'Waiting for API response...',
    walletAddress: 'Loading',
    walletBalance: 'Waiting for API response...',
    progress: 1,
    traits: ['Creative', 'Omniscient', 'Profound']
  });

  const walletAddress = 'Loading...';
  const connection = new Connection('https://api.mainnet-beta.solana.com');
  const migrationThreshold = 432;

  useEffect(() => {
    const fetchTokenData = async () => {
      try {
        const response = await fetch(`/api/dex/kamiyo?pair=${encodeURIComponent(mintAddress)}`);
        if (!response.ok) throw new Error('Pair not found');
        const data = await response.json();
        const pairData = data.data?.pairs?.[0] || null;
        if (!pairData) throw new Error('No pair data available');

        const tokenMint = new PublicKey(mintAddress);
        const walletPublicKey = new PublicKey(walletAddress);
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPublicKey, { mint: tokenMint });

        const walletBalance = tokenAccounts.value[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
        const marketCapSol = pairData.marketCap / pairData.priceUsd;
        let progressPercentage = Math.min((marketCapSol / migrationThreshold) * 100, 100);

        setTokenData({
          ca: mintAddress,
          marketCap: pairData.marketCap ? `$${Math.round(pairData.marketCap).toLocaleString()}` : 'Waiting for API response...',
          walletAddress,
          walletBalance: `$${(walletBalance * (pairData.priceUsd || 0)).toFixed(2)} USD`,
          progress: Math.max(progressPercentage, 1),
          traits: pairData.traits?.length > 0 ? pairData.traits : ['Creative', 'Omniscient', 'Profound']
        });
      } catch (error) {
        console.error('Failed to fetch token data:', error.message);
        setTokenData({
          ca: mintAddress || 'Waiting for API response...',
          marketCap: 'Waiting for API response...',
          walletAddress,
          walletBalance: 'Waiting for API response...',
          progress: 1,
          traits: ['Creative', 'Omniscient', 'Profound']
        });
      }
    };

    fetchTokenData();
  }, [mintAddress]);

  return tokenData;
}
