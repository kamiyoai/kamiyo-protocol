import { Connection, PublicKey } from '@solana/web3.js';
import { getSimulatedStats, isEmptyStats } from '../../lib/simulated-stats';

const PROGRAM_ID = 'E5EiaJhbg6Bav1v3P211LNv1tAqa4fHVeuGgRBHsEu6n';
const RPC_ENDPOINTS = [
    'https://mainnet.helius-rpc.com/?api-key=c4a9b21c-8650-451d-9572-8c8a3543a0be',
    'https://rpc.ankr.com/solana',
    'https://api.mainnet-beta.solana.com'
];

async function getWorkingConnection() {
    for (const rpc of RPC_ENDPOINTS) {
        try {
            const connection = new Connection(rpc, 'confirmed');
            await connection.getLatestBlockhash();
            return connection;
        } catch (e) {
            continue;
        }
    }
    return null;
}

async function fetchRealStats() {
    const connection = await getWorkingConnection();
    if (!connection) return null;

    const programId = new PublicKey(PROGRAM_ID);
    const signatures = await connection.getSignaturesForAddress(programId, { limit: 50 });

    let totalAssessments = 0;
    let completed = 0;
    let qualityScores = [];
    let totalRefunded = 0;

    for (const sig of signatures) {
        try {
            const tx = await connection.getTransaction(sig.signature, {
                maxSupportedTransactionVersion: 0
            });

            if (tx?.meta?.logMessages) {
                const logs = tx.meta.logMessages;

                if (logs.some(l => l.includes('Dispute') || l.includes('Quality'))) {
                    totalAssessments++;
                }

                const qualityLog = logs.find(l => l.includes('Quality Score:'));
                if (qualityLog) {
                    const match = qualityLog.match(/Quality Score: (\d+)/);
                    if (match) {
                        qualityScores.push(parseInt(match[1]));
                        completed++;
                    }
                }

                const refundLog = logs.find(l => l.includes('Refund to Agent:'));
                if (refundLog) {
                    const match = refundLog.match(/Refund to Agent: ([\d.]+)/);
                    if (match) {
                        totalRefunded += parseFloat(match[1]);
                    }
                }
            }
        } catch (e) {
            continue;
        }
    }

    let distribution = [0, 0, 0, 0, 0];
    qualityScores.forEach(score => {
        const bucket = Math.min(Math.floor(score / 20), 4);
        distribution[bucket]++;
    });

    const avgQuality = qualityScores.length > 0
        ? (qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length).toFixed(1)
        : '0';

    return {
        totalAssessments,
        completed,
        avgQuality,
        totalRefunded: totalRefunded.toFixed(2),
        distribution
    };
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const realStats = await fetchRealStats();

        // Use simulated stats if real stats are empty
        if (isEmptyStats(realStats)) {
            return res.status(200).json(getSimulatedStats());
        }

        res.status(200).json({
            ...realStats,
            isSimulated: false,
            lastUpdated: new Date().toISOString()
        });
    } catch (error) {
        console.error('Protocol stats error:', error);
        // Return simulated data on error
        res.status(200).json(getSimulatedStats());
    }
}
