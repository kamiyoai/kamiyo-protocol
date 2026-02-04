import { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore } from '../../src/stores/agent';
import { useWalletStore } from '../../src/stores/wallet';
import { AGENT_SKILLS, TIER_THRESHOLDS } from '../../src/lib/constants';
import { api, ApiJob } from '../../src/lib/api';

export default function JobsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
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
    return 'Just now';
  };

  return (
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>Jobs</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          {jobs.length} available job{jobs.length !== 1 ? 's' : ''}
        </Text>
      </View>

      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterButton, filter === 'all' && styles.filterActive]}
          onPress={() => setFilter('all')}
        >
          <Text
            style={[
              styles.filterText,
              filter === 'all' && styles.filterTextActive,
            ]}
          >
            All Jobs
          </Text>
        </Pressable>
        <Pressable
          style={[
            styles.filterButton,
            filter === 'matching' && styles.filterActive,
          ]}
          onPress={() => setFilter('matching')}
        >
          <Text
            style={[
              styles.filterText,
              filter === 'matching' && styles.filterTextActive,
            ]}
          >
            Matching Skills
          </Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#8b5cf6" />
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {jobs.length === 0 ? (
            <View style={[styles.emptyState, isDark && styles.cardDark]}>
              <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
                {filter === 'matching' ? 'No jobs match your skills' : 'No jobs available'}
              </Text>
              <Text style={[styles.emptySubtext, isDark && styles.subtitleDark]}>
                {filter === 'matching'
                  ? 'Add more skills to see more opportunities'
                  : 'Check back later for new opportunities'}
              </Text>
            </View>
          ) : (
            jobs.map((job) => {
              const { allowed, reason } = canAcceptJob(job);
              const isAccepting = acceptingJobId === job.id;
              return (
                <View
                  key={job.id}
                  style={[styles.jobCard, isDark && styles.cardDark]}
                >
                  <View style={styles.jobHeader}>
                    <Text style={[styles.jobTitle, isDark && styles.textDark]}>
                      {job.title}
                    </Text>
                    <View style={styles.paymentBadge}>
                      <Text style={styles.paymentText}>
                        {job.payment} {job.paymentToken}
                      </Text>
                    </View>
                  </View>

                  <Text style={[styles.jobDesc, isDark && styles.subtitleDark]}>
                    {job.description}
                  </Text>

                  <View style={styles.skillsRow}>
                    {job.requiredSkills.map((skill) => {
                      const hasSkill = agent?.skills?.includes(skill);
                      return (
                        <View
                          key={skill}
                          style={[
                            styles.skillTag,
                            hasSkill ? styles.skillMatch : styles.skillNoMatch,
                          ]}
                        >
                          <Text
                            style={[
                              styles.skillTagText,
                              hasSkill
                                ? styles.skillMatchText
                                : styles.skillNoMatchText,
                            ]}
                          >
                            {AGENT_SKILLS[skill]?.label || skill}
                          </Text>
                        </View>
                      );
                    })}
                  </View>

                  <View style={styles.jobMeta}>
                    <Text style={[styles.metaText, isDark && styles.subtitleDark]}>
                      {job.estimatedTime}
                    </Text>
                    <Text style={[styles.metaDot, isDark && styles.subtitleDark]}>
                      •
                    </Text>
                    <Text style={[styles.metaText, isDark && styles.subtitleDark]}>
                      {job.requiredTier !== 'unverified'
                        ? `${job.requiredTier.charAt(0).toUpperCase()}${job.requiredTier.slice(1)}+ required`
                        : 'Any tier'}
                    </Text>
                    <Text style={[styles.metaDot, isDark && styles.subtitleDark]}>
                      •
                    </Text>
                    <Text style={[styles.metaText, isDark && styles.subtitleDark]}>
                      {formatTimeAgo(job.createdAt)}
                    </Text>
                  </View>

                  <View style={styles.jobFooter}>
                    <Text style={[styles.posterText, isDark && styles.subtitleDark]}>
                      Posted by {job.poster}
                    </Text>
                    <Pressable
                      style={[
                        styles.acceptButton,
                        !allowed && styles.acceptButtonDisabled,
                      ]}
                      disabled={!allowed || isAccepting}
                      onPress={() => handleAcceptJob(job)}
                    >
                      {isAccepting ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text
                          style={[
                            styles.acceptButtonText,
                            !allowed && styles.acceptButtonTextDisabled,
                          ]}
                        >
                          {allowed ? 'Accept Job' : reason}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
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
  header: {
    padding: 20,
    paddingBottom: 0,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  textDark: {
    color: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
  },
  filterActive: {
    backgroundColor: '#8b5cf6',
  },
  filterText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  filterTextActive: {
    color: '#fff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  emptyState: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
  },
  cardDark: {
    backgroundColor: '#111',
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  jobCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  jobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  jobTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    flex: 1,
    marginRight: 12,
  },
  paymentBadge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  paymentText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803d',
  },
  jobDesc: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 12,
  },
  skillsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  skillTag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  skillMatch: {
    backgroundColor: '#ddd6fe',
  },
  skillNoMatch: {
    backgroundColor: '#e5e7eb',
  },
  skillTagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  skillMatchText: {
    color: '#7c3aed',
  },
  skillNoMatchText: {
    color: '#6b7280',
  },
  jobMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  metaText: {
    fontSize: 12,
    color: '#9ca3af',
  },
  metaDot: {
    marginHorizontal: 6,
    color: '#9ca3af',
  },
  jobFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 12,
  },
  posterText: {
    fontSize: 12,
    color: '#6b7280',
  },
  acceptButton: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    backgroundColor: '#e5e7eb',
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  acceptButtonTextDisabled: {
    color: '#9ca3af',
  },
});
