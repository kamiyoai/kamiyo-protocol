// pages/api/v2/features/contracts.js
import { getSession } from "next-auth/react";
import prisma from "../../../../lib/prisma";
import { withRateLimit } from "../../../../lib/rateLimit";

async function handler(req, res) {
  try {
    // Check authentication
    const session = await getSession({ req });
    if (!session?.user?.email) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Get user and check subscription
    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const subscription = await prisma.subscription.findFirst({
      where: {
        userId: user.id,
        status: 'active'
      },
      select: { tier: true },
      orderBy: { createdAt: 'desc' },
    });

    // Check if user has Pro+ tier
    const allowedTiers = ['pro', 'team', 'enterprise'];
    if (!subscription || !allowedTiers.includes(subscription.tier?.toLowerCase())) {
      return res.status(403).json({ error: "Pro tier or higher required" });
    }

    if (req.method === 'POST') {
      const { address, chain } = req.body;

      if (!address || !chain) {
        return res.status(400).json({ error: "address and chain required" });
      }

      // TODO: Implement actual contract metadata extraction
      // For now, return demo contract metadata
      const metadata = {
        address,
        chain,
        verified: true,
        contract_name: 'UniswapV2Router02',
        compiler: {
          version: '0.8.20',
          optimizer: {
            enabled: true,
            runs: 200
          },
          evm_version: 'paris'
        },
        deployment: {
          deployer: '0x1234...5678',
          transaction_hash: '0xabcd...ef01',
          block_number: 18500000,
          timestamp: '2024-01-15T10:30:00Z',
          creation_code_length: 24567
        },
        contract_type: {
          is_proxy: false,
          is_upgradeable: false,
          implementation_address: null,
          proxy_type: null
        },
        source_code: {
          available: true,
          language: 'Solidity',
          license: 'MIT',
          imports: [
            '@openzeppelin/contracts/token/ERC20/IERC20.sol',
            '@openzeppelin/contracts/security/ReentrancyGuard.sol',
            '@uniswap/v2-core/contracts/interfaces/IUniswapV2Factory.sol'
          ]
        },
        abi: {
          functions_count: 42,
          events_count: 8,
          public_functions: 35,
          external_functions: 28,
          payable_functions: 6
        },
        security_features: {
          has_reentrancy_guard: true,
          has_access_control: true,
          has_pausable: false,
          uses_safe_math: false,
          compiler_version_safe: true
        },
        statistics: {
          transaction_count: 1250000,
          unique_callers: 45000,
          total_value_usd: 2500000000,
          last_activity: '2024-03-20T14:30:00Z'
        },
        metadata: {
          fetched_at: new Date().toISOString(),
          data_source: 'etherscan',
          cache_ttl: 3600
        }
      };

      return res.status(200).json(metadata);
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    console.error('Contract metadata API error:', error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export default withRateLimit(handler);
