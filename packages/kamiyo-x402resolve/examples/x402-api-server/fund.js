const { Connection, PublicKey, LAMPORTS_PER_SOL } = require('@solana/web3.js');

async function fundWallet() {
  const connection = new Connection('https://api.devnet.solana.com', 'confirmed');
  const wallet = new PublicKey('5PFae6U5UVBEzfmrWnkMpuMu6iifg915rkvZ1hk5vN1o');
  
  try {
    const currentBalance = await connection.getBalance(wallet);
    console.log('Current balance:', currentBalance / LAMPORTS_PER_SOL, 'SOL');
    
    console.log('Requesting 2 SOL airdrop...');
    const signature = await connection.requestAirdrop(wallet, 2 * LAMPORTS_PER_SOL);
    console.log('Airdrop signature:', signature);
    
    console.log('Confirming transaction...');
    await connection.confirmTransaction(signature, 'confirmed');
    
    const newBalance = await connection.getBalance(wallet);
    console.log('New balance:', newBalance / LAMPORTS_PER_SOL, 'SOL');
    console.log('Successfully funded wallet!');
  } catch (err) {
    console.error('Error:', err.message);
  }
}

fundWallet();
