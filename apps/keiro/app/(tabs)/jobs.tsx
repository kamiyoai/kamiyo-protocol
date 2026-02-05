import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore } from '../../src/stores/agent';
import { useWalletStore } from '../../src/stores/wallet';
import { AGENT_SKILLS } from '../../src/lib/constants';
import { api, ApiJob } from '../../src/lib/api';
import { colors, typography, spacing, tierColors } from '../../src/theme';
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

export default function JobsScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [jobs, setJobs] = useState<ApiJob[]>([]);
  const [filter, setFilter] = useState<'all' | 'matching'>('all');
  const [acceptingJobId, setAcceptingJobId] = useState<string | null>(null);

  const { agent } = useAgentStore();
  const { connected, publicKey } = useWalletStore();

  const fetchJobs = useCallback(async () => {
    try {
      if (filter === 'matching' && agent?.id) {
        const matchingJobs = await api.getMatchingJobs(agent.id);
        setJobs(matchingJobs);
      } else {
        const openJobs = await api.getOpenJobs();
        setJobs(openJobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  }, [filter, agent?.id]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchJobs();
    setRefreshing(false);
  };

  const canAcceptJob = (job: ApiJob) => {
    if (!connected) return { allowed: false, reason: 'Connect wallet' };
    if (!agent?.isActive) return { allowed: false, reason: 'Activate agent' };

    const tierOrder = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];
    const agentTierIndex = tierOrder.indexOf(agent?.tier || 'unverified');
    const requiredTierIndex = tierOrder.indexOf(job.requiredTier);

    if (agentTierIndex < requiredTierIndex) {
      return { allowed: false, reason: `Requires ${job.requiredTier}` };
    }

    const hasMatchingSkill = job.requiredSkills.some((skill) =>
      agent?.skills?.includes(skill)
    );
    if (!hasMatchingSkill) {
      return { allowed: false, reason: 'Missing skills' };
    }

    return { allowed: true, reason: null };
  };

  const handleAcceptJob = async (job: ApiJob) => {
    if (!agent || !publicKey) return;

    setAcceptingJobId(job.id);
    try {
      const result = await api.acceptJob(job.id, agent.id, publicKey.toString());
      Alert.alert(
        'Job Accepted',
        `You've accepted "${job.title}". Escrow ID: ${result.escrowId.slice(0, 8)}...`,
        [{ text: 'OK', onPress: () => fetchJobs() }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to accept job';
      Alert.alert('Error', message);
    } finally {
      setAcceptingJobId(null);
    }
  };

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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.headerArea}>
        <TerminalHeader command="jobs --list" />

        <Text style={styles.countText}>
          {jobs.length} available job{jobs.length !== 1 ? 's' : ''}
        </Text>

        <View style={styles.filterRow}>
          <TerminalButton
            variant={filter === 'all' ? 'primary' : 'secondary'}
            onPress={() => setFilter('all')}
            style={styles.filterButton}
          >
            ALL JOBS
          </TerminalButton>
          <TerminalButton
            variant={filter === 'matching' ? 'primary' : 'secondary'}
            onPress={() => setFilter('matching')}
            style={styles.filterButton}
          >
            MATCHING
          </TerminalButton>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      ) : (
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
          {jobs.length === 0 ? (
            <TerminalFrame style={styles.emptyState}>
              <Text style={styles.emptyText}>
                {filter === 'matching'
                  ? 'no jobs match your skills'
                  : 'no jobs available'}
              </Text>
              <Text style={styles.emptySubtext}>
                {filter === 'matching'
                  ? 'add more skills to see more opportunities'
                  : 'check back later for new opportunities'}
              </Text>
            </TerminalFrame>
          ) : (
            jobs.map((job) => {
              const { allowed, reason } = canAcceptJob(job);
              const isAccepting = acceptingJobId === job.id;
              const tierColor =
                tierColors[job.requiredTier as keyof typeof tierColors] ||
                colors.gray500;

              return (
                <TerminalFrame
                  key={job.id}
                  title={job.title}
                  style={styles.jobCard}
                >
                  <Text style={styles.jobDesc}>{job.description}</Text>

                  <View style={styles.skillsRow}>
                    {job.requiredSkills.map((skill) => {
                      const hasSkill = agent?.skills?.includes(skill);
                      return (
                        <TerminalBadge
                          key={skill}
                          variant={hasSkill ? 'cyan' : 'dim'}
                        >
                          {AGENT_SKILLS[skill]?.label || skill}
                        </TerminalBadge>
                      );
                    })}
                  </View>

                  <Text style={styles.metaText}>
                    {job.estimatedTime} / {' '}
                    <Text style={{ color: tierColor }}>
                      {job.requiredTier !== 'unverified'
                        ? `${job.requiredTier.charAt(0).toUpperCase()}${job.requiredTier.slice(1)}+`
                        : 'any tier'}
                    </Text>
                    {' '} / {formatTimeAgo(job.createdAt)}
                  </Text>

                  <TerminalDivider marginVertical={spacing.md} />

                  <DotLeaderRow
                    label="reward"
                    value={`${job.payment} ${job.paymentToken}`}
                    valueColor={colors.accent}
                  />

                  <View style={styles.jobFooter}>
                    <Text style={styles.posterText}>
                      posted by {job.poster.toLowerCase()}
                    </Text>
                    {allowed ? (
                      <TerminalButton
                        variant="primary"
                        disabled={isAccepting}
                        loading={isAccepting}
                        onPress={() => handleAcceptJob(job)}
                        style={styles.acceptButton}
                      >
                        ACCEPT
                      </TerminalButton>
                    ) : (
                      <TerminalBadge variant="dim">
                        {reason || ''}
                      </TerminalBadge>
                    )}
                  </View>
                </TerminalFrame>
              );
            })
          )}

          <View style={styles.footer}>
            <Text style={styles.footerText}>KAMIYO PROTOCOL</Text>
            <Text style={styles.footerSubtext}>
              ai agents with permanent careers on origintrail dkg
            </Text>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  headerArea: {
    padding: spacing.xl,
    paddingBottom: 0,
  },
  countText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
    marginBottom: spacing.lg,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  filterButton: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  emptyState: {
    marginBottom: spacing.xl,
  },
  emptyText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.base,
    color: colors.white,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
  },
  jobCard: {
    marginBottom: spacing.lg,
  },
  jobDesc: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.bodyText,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  metaText: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    letterSpacing: typography.letterSpacing.wide,
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
  },
  posterText: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
  },
  acceptButton: {
    minHeight: 36,
    paddingVertical: 8,
    paddingHorizontal: 16,
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
