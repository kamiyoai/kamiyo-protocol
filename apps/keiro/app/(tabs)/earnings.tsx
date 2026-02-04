import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore, getShortAddress } from '../../src/stores/wallet';
import { useAgentStore } from '../../src/stores/agent';
import { api, ApiEarning, EarningsStats } from '../../src/lib/api';

export default function EarningsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<EarningsStats | null>(null);
  const [earnings, setEarnings] = useState<ApiEarning[]>([]);

  const { connected, connecting, balance, connect, disconnect, refreshBalance, publicKey } =
    useWalletStore();
  const { agent } = useAgentStore();

  const fetchEarningsData = useCallback(async () => {
    if (!agent?.id) return;

    try {
      const [statsData, earningsData] = await Promise.all([
        api.getEarningsStats(agent.id),
        api.getEarnings(agent.id),
      ]);
      setStats(statsData);
      setEarnings(earningsData);
    } catch (error) {
      console.error('Failed to fetch earnings:', error);
    }
  }, [agent?.id]);

  useEffect(() => {
    if (agent?.id) {
      setLoading(true);
      fetchEarningsData().finally(() => setLoading(false));
    }
  }, [agent?.id, fetchEarningsData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshBalance(), fetchEarningsData()]);
    setRefreshing(false);
  }, [refreshBalance, fetchEarningsData]);

  const handleConnect = async () => {
    await connect();
  };

  const handleDisconnect = () => {
    disconnect();
  };

  // Calculate USD value (mock rate)
  const solPrice = 150;
  const usdBalance = balance * solPrice;

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return 'Just now';
  };

  const formatUsd = (sol: number, usdc: number) => {
    const solInUsd = sol * solPrice;
    return (solInUsd + usdc).toFixed(2);
  };

  return (
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      edges={['top']}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <Text style={[styles.title, isDark && styles.textDark]}>Earnings</Text>

        <View style={[styles.balanceCard, isDark && styles.cardDark]}>
          {connected ? (
            <>
              <Text style={[styles.balanceLabel, isDark && styles.subtitleDark]}>
                Total Balance
              </Text>
              <Text style={[styles.balanceAmount, isDark && styles.textDark]}>
                ${usdBalance.toFixed(2)}
              </Text>
              <Text style={[styles.balanceSol, isDark && styles.subtitleDark]}>
                {balance.toFixed(4)} SOL
              </Text>

              <View style={styles.walletInfo}>
                <View style={styles.addressRow}>
                  <View style={styles.connectedDot} />
                  <Text style={[styles.addressText, isDark && styles.subtitleDark]}>
                    {getShortAddress(publicKey)}
                  </Text>
                </View>
                <Pressable style={styles.disconnectButton} onPress={handleDisconnect}>
                  <Text style={styles.disconnectText}>Disconnect</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.balanceLabel, isDark && styles.subtitleDark]}>
                Connect Wallet
              </Text>
              <Text style={[styles.walletMessage, isDark && styles.subtitleDark]}>
                Connect your Solana wallet to view your balance and receive
                earnings from completed tasks.
              </Text>
              <Pressable
                style={[styles.connectButton, connecting && styles.buttonDisabled]}
                onPress={handleConnect}
                disabled={connecting}
              >
                {connecting ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.connectButtonText}>Connect Wallet</Text>
                )}
              </Pressable>
            </>
          )}
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              ${stats?.today.toFixed(2) || '0.00'}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              Today
            </Text>
          </View>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              ${stats?.thisWeek.toFixed(2) || '0.00'}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              This Week
            </Text>
          </View>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              ${stats?.thisMonth.toFixed(2) || '0.00'}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              This Month
            </Text>
          </View>
        </View>

        <View style={[styles.summaryCard, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Earnings Summary
          </Text>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Total Earned
            </Text>
            <Text style={[styles.summaryValue, isDark && styles.textDark]}>
              ${stats ? formatUsd(stats.totalEarned.sol, stats.totalEarned.usdc) : '0.00'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Pending
            </Text>
            <Text style={[styles.summaryValue, styles.pendingValue]}>
              ${stats ? formatUsd(stats.totalPending.sol, stats.totalPending.usdc) : '0.00'}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Transactions
            </Text>
            <Text style={[styles.summaryValue, isDark && styles.textDark]}>
              {stats?.transactionCount || 0}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Tasks Completed
            </Text>
            <Text style={[styles.summaryValue, isDark && styles.textDark]}>
              {agent?.tasksCompleted || 0}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Transaction History
        </Text>

        {loading ? (
          <View style={[styles.emptyState, isDark && styles.cardDark]}>
            <ActivityIndicator size="large" color="#8b5cf6" />
          </View>
        ) : earnings.length === 0 ? (
          <View style={[styles.emptyState, isDark && styles.cardDark]}>
            <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
              No transactions yet
            </Text>
            <Text style={[styles.emptySubtext, isDark && styles.subtitleDark]}>
              Complete tasks to start earning
            </Text>
          </View>
        ) : (
          <View style={[styles.transactionList, isDark && styles.cardDark]}>
            {earnings.map((tx) => (
              <View key={tx.id} style={styles.transactionRow}>
                <View style={styles.transactionLeft}>
                  <View
                    style={[
                      styles.transactionIcon,
                      tx.status === 'released'
                        ? styles.iconEarning
                        : tx.status === 'pending'
                          ? styles.iconPending
                          : styles.iconDisputed,
                    ]}
                  >
                    <Text style={styles.iconText}>
                      {tx.status === 'released' ? '+' : tx.status === 'pending' ? '...' : '!'}
                    </Text>
                  </View>
                  <View>
                    <Text style={[styles.txDescription, isDark && styles.textDark]}>
                      Job #{tx.jobId.slice(0, 8)}
                    </Text>
                    <Text style={[styles.txTime, isDark && styles.subtitleDark]}>
                      {formatTimeAgo(tx.createdAt)}
                    </Text>
                  </View>
                </View>
                <View style={styles.transactionRight}>
                  <Text
                    style={[
                      styles.txAmount,
                      tx.status === 'released'
                        ? styles.amountPositive
                        : styles.amountPending,
                    ]}
                  >
                    +{tx.amount} {tx.token}
                  </Text>
                  <Text
                    style={[
                      styles.txStatus,
                      tx.status === 'released'
                        ? styles.statusCompleted
                        : tx.status === 'pending'
                          ? styles.statusPending
                          : styles.statusDisputed,
                    ]}
                  >
                    {tx.status}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {connected && stats && stats.totalPending.sol + stats.totalPending.usdc > 0 && (
          <View style={[styles.actionCard, isDark && styles.cardDark]}>
            <Text style={[styles.actionTitle, isDark && styles.textDark]}>
              Pending Earnings
            </Text>
            <Text style={[styles.actionDesc, isDark && styles.subtitleDark]}>
              You have pending earnings that will be released after job completion approval.
            </Text>
            <View style={styles.pendingBreakdown}>
              {stats.totalPending.sol > 0 && (
                <Text style={[styles.pendingItem, isDark && styles.subtitleDark]}>
                  {stats.totalPending.sol.toFixed(4)} SOL
                </Text>
              )}
              {stats.totalPending.usdc > 0 && (
                <Text style={[styles.pendingItem, isDark && styles.subtitleDark]}>
                  {stats.totalPending.usdc.toFixed(2)} USDC
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 16,
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  balanceCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 48,
    fontWeight: '700',
    color: '#000',
  },
  balanceSol: {
    fontSize: 18,
    color: '#6b7280',
    marginTop: 4,
  },
  walletInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  connectedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  addressText: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: 'monospace',
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#fee2e2',
  },
  disconnectText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#dc2626',
  },
  walletMessage: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
    paddingHorizontal: 20,
  },
  connectButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
    minWidth: 180,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  connectButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  summaryCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  pendingValue: {
    color: '#f59e0b',
  },
  emptyState: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
  },
  transactionList: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  transactionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconEarning: {
    backgroundColor: '#dcfce7',
  },
  iconPending: {
    backgroundColor: '#fef3c7',
  },
  iconDisputed: {
    backgroundColor: '#fee2e2',
  },
  iconText: {
    fontSize: 18,
    fontWeight: '700',
  },
  txDescription: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  txTime: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  transactionRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 14,
    fontWeight: '600',
  },
  amountPositive: {
    color: '#16a34a',
  },
  amountPending: {
    color: '#f59e0b',
  },
  txStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  statusCompleted: {
    color: '#16a34a',
  },
  statusPending: {
    color: '#f59e0b',
  },
  statusDisputed: {
    color: '#dc2626',
  },
  actionCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  actionDesc: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  pendingBreakdown: {
    flexDirection: 'row',
    gap: 16,
  },
  pendingItem: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
  },
});
