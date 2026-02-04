import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore, AgentSkill } from '../../src/stores/agent';
import { useWalletStore } from '../../src/stores/wallet';
import { AGENT_SKILLS, TIER_THRESHOLDS } from '../../src/lib/constants';

interface Job {
  id: string;
  title: string;
  description: string;
  skills: AgentSkill[];
  payment: number;
  paymentToken: 'SOL' | 'USDC';
  requiredTier: keyof typeof TIER_THRESHOLDS;
  estimatedTime: string;
  poster: string;
  postedAt: string;
}

const MOCK_JOBS: Job[] = [
  {
    id: '1',
    title: 'Research DeFi Protocol Security',
    description:
      'Analyze the smart contract architecture and identify potential vulnerabilities in a new DeFi lending protocol.',
    skills: ['research', 'code_review'],
    payment: 0.5,
    paymentToken: 'SOL',
    requiredTier: 'unverified',
    estimatedTime: '2-3 hours',
    poster: 'DefiProtocol.sol',
    postedAt: '2 hours ago',
  },
  {
    id: '2',
    title: 'Technical Documentation Update',
    description:
      'Update API documentation for a blockchain indexer service. Must be clear and developer-friendly.',
    skills: ['writing', 'research'],
    payment: 25,
    paymentToken: 'USDC',
    requiredTier: 'unverified',
    estimatedTime: '1-2 hours',
    poster: 'IndexerDAO',
    postedAt: '4 hours ago',
  },
  {
    id: '3',
    title: 'Data Analysis - Token Metrics',
    description:
      'Analyze on-chain data for token holder distribution and trading patterns over the past 30 days.',
    skills: ['data_analysis', 'research'],
    payment: 1.2,
    paymentToken: 'SOL',
    requiredTier: 'bronze',
    estimatedTime: '3-4 hours',
    poster: 'TokenAnalytics',
    postedAt: '1 day ago',
  },
  {
    id: '4',
    title: 'Smart Contract Code Review',
    description:
      'Review Anchor program for a new NFT staking mechanism. Check for reentrancy and overflow issues.',
    skills: ['code_review'],
    payment: 100,
    paymentToken: 'USDC',
    requiredTier: 'silver',
    estimatedTime: '4-6 hours',
    poster: 'NFTStaking.xyz',
    postedAt: '3 days ago',
  },
  {
    id: '5',
    title: 'Translate Whitepaper to Spanish',
    description:
      'Translate 15-page technical whitepaper from English to Spanish. Must maintain technical accuracy.',
    skills: ['translation', 'writing'],
    payment: 0.8,
    paymentToken: 'SOL',
    requiredTier: 'unverified',
    estimatedTime: '5-6 hours',
    poster: 'GlobalDAO',
    postedAt: '6 hours ago',
  },
];

export default function JobsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'matching'>('all');

  const { agent } = useAgentStore();
  const { connected } = useWalletStore();

  const onRefresh = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 1000);
  };

  const filteredJobs =
    filter === 'matching' && agent?.skills
      ? MOCK_JOBS.filter(job =>
          job.skills.some(skill => agent.skills.includes(skill))
        )
      : MOCK_JOBS;

  const canAcceptJob = (job: Job) => {
    if (!connected) return { allowed: false, reason: 'Connect wallet to accept jobs' };
    if (!agent?.isActive) return { allowed: false, reason: 'Activate your agent first' };

    const tierOrder = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];
    const agentTierIndex = tierOrder.indexOf(agent?.tier || 'unverified');
    const requiredTierIndex = tierOrder.indexOf(job.requiredTier);

    if (agentTierIndex < requiredTierIndex) {
      return { allowed: false, reason: `Requires ${job.requiredTier} tier` };
    }

    const hasMatchingSkill = job.skills.some(skill => agent?.skills?.includes(skill));
    if (!hasMatchingSkill) {
      return { allowed: false, reason: 'Missing required skills' };
    }

    return { allowed: true, reason: null };
  };

  return (
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      edges={['top']}
    >
      <View style={styles.header}>
        <Text style={[styles.title, isDark && styles.textDark]}>Jobs</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          {filteredJobs.length} available job{filteredJobs.length !== 1 ? 's' : ''}
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

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredJobs.length === 0 ? (
          <View style={[styles.emptyState, isDark && styles.cardDark]}>
            <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
              No jobs match your skills
            </Text>
            <Text style={[styles.emptySubtext, isDark && styles.subtitleDark]}>
              Add more skills to see more opportunities
            </Text>
          </View>
        ) : (
          filteredJobs.map(job => {
            const { allowed, reason } = canAcceptJob(job);
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
                  {job.skills.map(skill => {
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
                    {job.postedAt}
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
                    disabled={!allowed}
                  >
                    <Text
                      style={[
                        styles.acceptButtonText,
                        !allowed && styles.acceptButtonTextDisabled,
                      ]}
                    >
                      {allowed ? 'Accept Job' : reason}
                    </Text>
                  </Pressable>
                </View>
              </View>
            );
          })
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
