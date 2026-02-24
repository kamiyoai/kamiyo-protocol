import { useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore, getShortAddress } from '../../src/stores/wallet';
import { useAgentStore } from '../../src/stores/agent';
import { api, ApiEarning, EarningsStats } from '../../src/lib/api';
import { colors, typography, spacing } from '../../src/theme';
import {
  TerminalFrame,
  TerminalButton,
  TerminalBadge,
  TerminalHeader,
  TerminalDivider,
  DotLeaderRow,
} from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function EarningsScreen() {
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
    } catch {
      setStats(null);
      setEarnings([]);
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
    return 'just now';
  };

  const formatUsd = (sol: number, usdc: number) => {
    const solInUsd = sol * solPrice;
    return (solInUsd + usdc).toFixed(2);
  };

  const getStatusColor = (status: string) => {
    if (status === 'released') return colors.accent;
    if (status === 'pending') return colors.orange500;
    return colors.red500;
  };

  const getStatusPrefix = (status: string) => {
    if (status === 'released') return '+';
    if (status === 'pending') return '~';
    return '!';
  };

  const getStatusVariant = (status: string): 'cyan' | 'warning' | 'danger' => {
    if (status === 'released') return 'cyan';
    if (status === 'pending') return 'warning';
    return 'danger';
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
          />
        }
      >
        <TerminalHeader command="earnings" />

        <TerminalFrame title="BALANCE" style={styles.section}>
          {connected ? (
            <>
              <Text style={styles.balanceLarge}>
                ${usdBalance.toFixed(2)}
              </Text>
              <Text style={styles.balanceSol}>
                {balance.toFixed(4)} SOL
              </Text>

              <View style={styles.addressRow}>
                <Text style={styles.addressDot}>{'\u25CF'} </Text>
                <Text style={styles.addressText}>
                  {getShortAddress(publicKey)}
                </Text>
              </View>

              <TerminalButton
                variant="danger"
                onPress={handleDisconnect}
                style={styles.disconnectBtn}
              >
                DISCONNECT
              </TerminalButton>
            </>
          ) : (
            <>
              <Text style={styles.dimText}>
                connect your solana wallet to view balance and receive earnings
              </Text>
              <TerminalButton
                variant="primary"
                onPress={handleConnect}
                loading={connecting}
                style={styles.connectBtn}
              >
                CONNECT WALLET
              </TerminalButton>
            </>
          )}
        </TerminalFrame>

        <TerminalDivider label="PERIOD" />

        <View style={styles.dataSection}>
          <DotLeaderRow
            label="today"
            value={`$${stats?.today.toFixed(2) || '0.00'}`}
          />
          <DotLeaderRow
            label="this week"
            value={`$${stats?.thisWeek.toFixed(2) || '0.00'}`}
          />
          <DotLeaderRow
            label="this month"
            value={`$${stats?.thisMonth.toFixed(2) || '0.00'}`}
          />
        </View>

        <TerminalDivider label="SUMMARY" />

        <View style={styles.dataSection}>
          <DotLeaderRow
            label="total earned"
            value={`$${stats ? formatUsd(stats.totalEarned.sol, stats.totalEarned.usdc) : '0.00'}`}
            valueColor={colors.accent}
          />
          <DotLeaderRow
            label="pending"
            value={`$${stats ? formatUsd(stats.totalPending.sol, stats.totalPending.usdc) : '0.00'}`}
            valueColor={colors.orange500}
          />
          <DotLeaderRow
            label="transactions"
            value={stats?.transactionCount || 0}
          />
          <DotLeaderRow
            label="tasks completed"
            value={agent?.tasksCompleted || 0}
          />
        </View>

        <TerminalDivider label="HISTORY" />

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
          </View>
        ) : earnings.length === 0 ? (
          <View style={styles.dataSection}>
            <Text style={styles.dimText}>no transactions yet</Text>
            <Text style={styles.dimSubtext}>
              complete tasks to start earning
            </Text>
          </View>
        ) : (
          <View style={styles.dataSection}>
            {earnings.map((tx) => (
              <View key={tx.id} style={styles.txRow}>
                <Text
                  style={[
                    styles.txPrefix,
                    { color: getStatusColor(tx.status) },
                  ]}
                >
                  {getStatusPrefix(tx.status)}
                </Text>
                <Text style={styles.txAmount}>
                  {tx.amount} {tx.token}
                </Text>
                <Text style={styles.txJob}>
                  job#{tx.jobId.slice(0, 4)}..
                </Text>
                <Text style={styles.txTime}>
                  {formatTimeAgo(tx.createdAt)}
                </Text>
                <TerminalBadge variant={getStatusVariant(tx.status)}>
                  {tx.status.toUpperCase()}
                </TerminalBadge>
              </View>
            ))}
          </View>
        )}

        {connected && stats && stats.totalPending.sol + stats.totalPending.usdc > 0 && (
          <TerminalFrame
            title="PENDING"
            accent={colors.orange500}
            style={styles.section}
          >
            <Text style={styles.pendingDesc}>
              pending earnings will be released after job completion approval
            </Text>
            <View style={styles.pendingBreakdown}>
              {stats.totalPending.sol > 0 && (
                <Text style={styles.pendingItem}>
                  {stats.totalPending.sol.toFixed(4)} SOL
                </Text>
              )}
              {stats.totalPending.usdc > 0 && (
                <Text style={styles.pendingItem}>
                  {stats.totalPending.usdc.toFixed(2)} USDC
                </Text>
              )}
            </View>
          </TerminalFrame>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>KAMIYO PROTOCOL</Text>
          <Text style={styles.footerSubtext}>
            ai agents with permanent careers on origintrail dkg
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  section: {
    marginBottom: spacing.md,
  },
  balanceLarge: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize['4xl'],
    color: colors.white,
    letterSpacing: typography.letterSpacing.tight,
  },
  balanceSol: {
    fontFamily,
    fontSize: typography.fontSize.lg,
    color: colors.accent,
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  addressDot: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.accent,
  },
  addressText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
  },
  disconnectBtn: {
    marginTop: spacing.sm,
  },
  connectBtn: {
    marginTop: spacing.lg,
  },
  dimText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
  },
  dimSubtext: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
  dataSection: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  loadingContainer: {
    padding: spacing['3xl'],
    alignItems: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txPrefix: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.sm,
    width: 14,
  },
  txAmount: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.sm,
    color: colors.white,
    minWidth: 80,
  },
  txJob: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    flex: 1,
  },
  txTime: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginRight: spacing.sm,
  },
  pendingDesc: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.bodyText,
    marginBottom: spacing.md,
  },
  pendingBreakdown: {
    flexDirection: 'row',
    gap: spacing.lg,
  },
  pendingItem: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.base,
    color: colors.orange500,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  footerText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    letterSpacing: typography.letterSpacing.wide,
  },
  footerSubtext: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray600,
    marginTop: spacing.xs,
  },
});
