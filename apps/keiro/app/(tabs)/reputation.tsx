import { useState, useEffect, useCallback } from 'react';
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
import { useAgentStore } from '../../src/stores/agent';
import { AGENT_SKILLS, AGENT_PERSONALITIES } from '../../src/lib/constants';
import { api, ReputationData } from '../../src/lib/api';
import { colors, typography, spacing, tierColors } from '../../src/theme';
import {
  TerminalFrame,
  TerminalBadge,
  TerminalButton,
  TerminalHeader,
  TerminalDivider,
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

export default function ReputationScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [reputation, setReputation] = useState<ReputationData | null>(null);

  const { agent, syncFromServer } = useAgentStore();

  const fetchReputation = useCallback(async () => {
    if (!agent?.id) return;

    try {
      const reputationData = await api.getReputation(agent.id);
      setReputation(reputationData);
    } catch (error) {
      console.error('Failed to fetch reputation:', error);
    }
  }, [agent?.id]);

  useEffect(() => {
    if (agent?.id) {
      setLoading(true);
      fetchReputation().finally(() => setLoading(false));
    }
  }, [agent?.id, fetchReputation]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchReputation(), syncFromServer()]);
    setRefreshing(false);
  }, [fetchReputation, syncFromServer]);

  const tierColor = agent?.tier
    ? tierColors[agent.tier as keyof typeof tierColors]
    : tierColors.unverified;

  const creditScore = reputation?.creditScore ?? agent?.creditScore ?? 0;

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
        <TerminalHeader command="reputation" />

        <TerminalFrame title="AGENT" style={styles.section}>
          <View style={styles.profileCenter}>
            <View style={[styles.avatar, { borderColor: tierColor }]}>
              <Text style={styles.avatarText}>
                {agent?.name?.charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
            <Text style={styles.agentName}>
              {agent?.name || 'your agent'}
            </Text>
            <Text style={styles.personalityText}>
              {agent?.personality
                ? AGENT_PERSONALITIES[agent.personality]?.label?.toLowerCase()
                : 'no personality set'}
            </Text>
            <TerminalBadge variant="cyan">
              {agent?.tier
                ? agent.tier.charAt(0).toUpperCase() + agent.tier.slice(1)
                : 'Unverified'}
            </TerminalBadge>
            {agent?.globalId && (
              <Text style={styles.globalIdText}>
                DKG: {agent.globalId.slice(0, 16)}...
              </Text>
            )}
          </View>
        </TerminalFrame>

        <TerminalFrame title="CREDIT SCORE" style={styles.section}>
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={colors.accent} />
            </View>
          ) : (
            <>
              <Text style={[styles.scoreValue, { color: tierColor }]}>
                {creditScore}
              </Text>
              {reputation?.tierProgress && reputation.tierProgress.nextTier && (
                <View style={styles.progressSection}>
                  <AsciiProgress
                    value={reputation.tierProgress.progress}
                    color={tierColor}
                  />
                  <Text style={styles.progressText}>
                    {reputation.tierProgress.pointsToNext} points to{' '}
                    {reputation.tierProgress.nextTier.charAt(0).toUpperCase() +
                      reputation.tierProgress.nextTier.slice(1)}
                  </Text>
                </View>
              )}
            </>
          )}
        </TerminalFrame>

        <TerminalDivider label="COMPONENTS" />

        <View style={styles.dataSection}>
          {reputation?.components ? (
            Object.entries(reputation.components).map(([key, component]) => (
              <DotLeaderRow
                key={key}
                label={formatComponentName(key).toLowerCase()}
                value={`${component.score}/${component.weight}`}
                valueColor={colors.accent}
              />
            ))
          ) : (
            <Text style={styles.dimText}>
              {loading ? 'loading...' : 'no reputation data'}
            </Text>
          )}
        </View>

        <TerminalDivider label="STATS" />

        <View style={styles.dataSection}>
          <DotLeaderRow
            label="tasks completed"
            value={reputation?.stats?.tasksCompleted ?? agent?.tasksCompleted ?? 0}
          />
          <DotLeaderRow
            label="disputes"
            value={reputation?.stats?.disputeCount ?? agent?.disputeCount ?? 0}
          />
          <DotLeaderRow
            label="tenure"
            value={`${reputation?.stats?.tenureDays ?? agent?.tenureDays ?? 0}d`}
          />
          <DotLeaderRow
            label="avg quality"
            value={
              reputation?.stats?.avgQuality ?? agent?.avgQuality
                ? `${(reputation?.stats?.avgQuality ?? agent?.avgQuality ?? 0).toFixed(0)}%`
                : '--'
            }
          />
        </View>

        <TerminalDivider label="SKILLS" />

        <View style={styles.dataSection}>
          {agent?.skills?.length ? (
            agent.skills.map((skill) => (
              <View key={skill} style={styles.skillRow}>
                <TerminalBadge variant="cyan">
                  {AGENT_SKILLS[skill]?.label || skill}
                </TerminalBadge>
                <Text style={styles.skillDesc}>
                  {AGENT_SKILLS[skill]?.description || ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={styles.dimText}>no skills configured</Text>
          )}
        </View>

        <TerminalFrame title="DKG" accent={colors.accent} style={styles.section}>
          <Text style={styles.dkgDesc}>
            your reputation is permanently stored on the decentralized knowledge
            graph. this creates an immutable record of your agent's career.
          </Text>
          <TerminalButton variant="primary" onPress={() => {}}>
            VIEW ON DKG EXPLORER
          </TerminalButton>
        </TerminalFrame>

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

function formatComponentName(key: string): string {
  const names: Record<string, string> = {
    taskQuality: 'Task Quality',
    reliability: 'Reliability',
    disputeRecord: 'Dispute Record',
    peerTrust: 'Peer Trust',
    tenure: 'Tenure',
  };
  return names[key] || key;
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
  profileCenter: {
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    backgroundColor: colors.bg.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: spacing.md,
  },
  avatarText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize['2xl'],
    color: colors.white,
  },
  agentName: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.xl,
    color: colors.white,
    letterSpacing: typography.letterSpacing.tight,
    marginBottom: spacing.xs,
  },
  personalityText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
    marginBottom: spacing.md,
  },
  globalIdText: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.md,
  },
  scoreValue: {
    fontFamily: fontFamilyBold,
    fontSize: 56,
    letterSpacing: typography.letterSpacing.tight,
    textAlign: 'center',
  },
  progressSection: {
    marginTop: spacing.lg,
    alignItems: 'center',
  },
  progressText: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  loadingContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  dataSection: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  dimText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
  },
  skillRow: {
    paddingVertical: spacing.sm,
  },
  skillDesc: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.xs,
    paddingLeft: spacing.sm,
  },
  dkgDesc: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.bodyText,
    lineHeight: 20,
    marginBottom: spacing.lg,
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
