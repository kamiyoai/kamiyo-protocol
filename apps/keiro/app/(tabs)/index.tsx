import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore } from '../../src/stores/wallet';
import { useAgentStore } from '../../src/stores/agent';
import { AGENT_SKILLS } from '../../src/lib/constants';
import { colors, typography, tierColors, spacing } from '../../src/theme';
import {
  TerminalFrame,
  TerminalBadge,
  TerminalDivider,
  TerminalHeader,
  DotLeaderRow,
  AsciiProgress,
} from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function HomeScreen() {
  const [refreshing, setRefreshing] = useState(false);

  const { connected, balance, refreshBalance } = useWalletStore();
  const { agent } = useAgentStore();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshBalance();
    setRefreshing(false);
  }, [refreshBalance]);

  const tierColor = agent?.tier ? tierColors[agent.tier] : colors.gray500;
  const scoreProgress = agent?.creditScore ? Math.min(100, agent.creditScore) : 0;

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
        <TerminalHeader command="--status" />

        <View style={styles.greetingRow}>
          <Text style={styles.greetingText}>
            {getGreeting().toLowerCase()},{' '}
            <Text style={styles.agentNameText}>
              {agent?.name?.toLowerCase() || 'agent'}
            </Text>
          </Text>
          <View style={styles.badgeRow}>
            {agent?.agentPda && (
              <TerminalBadge variant="cyan">ON-CHAIN</TerminalBadge>
            )}
            <TerminalBadge variant="status" active={agent?.isActive || false}>
              {agent?.isActive ? 'ACTIVE' : 'INACTIVE'}
            </TerminalBadge>
          </View>
        </View>

        <TerminalFrame title="CREDIT SCORE" style={styles.section}>
          <DotLeaderRow
            label="score"
            value={agent?.creditScore || 0}
            valueColor={tierColor}
          />
          <DotLeaderRow
            label="tier"
            value={
              agent?.tier
                ? agent.tier.charAt(0).toUpperCase() + agent.tier.slice(1)
                : 'Unverified'
            }
            valueColor={tierColor}
          />
          <View style={styles.progressRow}>
            <AsciiProgress value={scoreProgress} color={tierColor} />
          </View>
        </TerminalFrame>

        <TerminalDivider label="TODAY" />

        <View style={styles.dataSection}>
          <DotLeaderRow label="earned" value="$0.00" />
          <DotLeaderRow label="tasks" value="0" />
          <DotLeaderRow label="avg quality" value="--" />
        </View>

        <TerminalDivider label="WALLET" />

        <View style={styles.dataSection}>
          {connected ? (
            <>
              <DotLeaderRow
                label="balance"
                value={`${balance.toFixed(4)} SOL`}
                valueColor={colors.accent}
              />
              <DotLeaderRow
                label="usd"
                value={`~$${(balance * 150).toFixed(2)}`}
              />
              {agent?.agentPda && (
                <DotLeaderRow
                  label="agent pda"
                  value={`${agent.agentPda.slice(0, 4)}...${agent.agentPda.slice(-4)}`}
                  valueColor={colors.violet}
                />
              )}
            </>
          ) : (
            <Text style={styles.dimText}>no wallet connected</Text>
          )}
        </View>

        <TerminalDivider label="SKILLS" />

        <View style={styles.skillsRow}>
          {agent?.skills?.length ? (
            agent.skills.map((skill) => (
              <TerminalBadge key={skill} variant="cyan">
                {AGENT_SKILLS[skill]?.label || skill}
              </TerminalBadge>
            ))
          ) : (
            <Text style={styles.dimText}>no skills configured</Text>
          )}
        </View>

        <TerminalDivider label="CAREER" />

        <View style={styles.dataSection}>
          <DotLeaderRow
            label="tasks completed"
            value={agent?.tasksCompleted || 0}
          />
          <DotLeaderRow
            label="disputes"
            value={agent?.disputeCount || 0}
          />
          <DotLeaderRow
            label="tenure"
            value={`${agent?.tenureDays || 0} days`}
          />
          <DotLeaderRow
            label="avg quality"
            value={agent?.avgQuality ? `${agent.avgQuality}%` : '--'}
          />
        </View>

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

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollView: {
    flex: 1,
    padding: spacing.xl,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  greetingText: {
    fontFamily,
    fontSize: typography.fontSize.lg,
    color: colors.gray400,
  },
  agentNameText: {
    fontFamily: fontFamilyBold,
    color: colors.white,
  },
  section: {
    marginBottom: spacing.md,
  },
  progressRow: {
    marginTop: spacing.sm,
  },
  dataSection: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  dimText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
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
