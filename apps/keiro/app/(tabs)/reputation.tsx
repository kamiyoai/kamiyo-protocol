import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ScrollView,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore } from '../../src/stores/agent';
import { TIER_COLORS, TIER_THRESHOLDS, AGENT_SKILLS, AGENT_PERSONALITIES } from '../../src/lib/constants';

export default function ReputationScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { agent } = useAgentStore();

  const tierColor = agent?.tier ? TIER_COLORS[agent.tier] : TIER_COLORS.unverified;
  const nextTier = getNextTier(agent?.tier);
  const progressToNextTier = getProgressToNextTier(agent?.creditScore || 0, agent?.tier);

  return (
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      edges={['top']}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, isDark && styles.textDark]}>Reputation</Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          Your agent's permanent career on the DKG
        </Text>

        <View style={[styles.profileCard, isDark && styles.cardDark]}>
          <View style={[styles.avatar, { borderColor: tierColor }]}>
            <Text style={styles.avatarText}>
              {agent?.name?.charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
          <Text style={[styles.agentName, isDark && styles.textDark]}>
            {agent?.name || 'Your Agent'}
          </Text>
          <Text style={[styles.personalityText, isDark && styles.subtitleDark]}>
            {agent?.personality
              ? AGENT_PERSONALITIES[agent.personality]?.label
              : 'No personality set'}
          </Text>
          <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
            <Text style={styles.tierText}>
              {agent?.tier
                ? agent.tier.charAt(0).toUpperCase() + agent.tier.slice(1)
                : 'Unverified'}
            </Text>
          </View>
        </View>

        <View style={[styles.scoreCard, isDark && styles.cardDark]}>
          <Text style={[styles.scoreLabel, isDark && styles.subtitleDark]}>
            Credit Score
          </Text>
          <Text style={[styles.scoreValue, { color: tierColor }]}>
            {agent?.creditScore || 0}
          </Text>
          {nextTier && (
            <View style={styles.progressSection}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressToNextTier}%`, backgroundColor: tierColor },
                  ]}
                />
              </View>
              <Text style={[styles.progressText, isDark && styles.subtitleDark]}>
                {TIER_THRESHOLDS[nextTier] - (agent?.creditScore || 0)} points to{' '}
                {nextTier.charAt(0).toUpperCase() + nextTier.slice(1)}
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Score Components
        </Text>
        <View style={[styles.breakdownCard, isDark && styles.cardDark]}>
          {[
            {
              label: 'Task Quality',
              value: agent?.avgQuality ? `${agent.avgQuality}%` : '--',
              weight: '40%',
              description: 'Average quality rating from completed tasks',
            },
            {
              label: 'Reliability',
              value: calculateReliability(agent?.tasksCompleted || 0),
              weight: '20%',
              description: 'Consistent task completion rate',
            },
            {
              label: 'Dispute Record',
              value: calculateDisputeScore(agent?.disputeCount || 0, agent?.tasksCompleted || 0),
              weight: '15%',
              description: 'Low disputes = higher score',
            },
            {
              label: 'Peer Trust',
              value: '--',
              weight: '15%',
              description: 'Trust from other agents on the network',
            },
            {
              label: 'Tenure',
              value: agent?.tenureDays ? `${agent.tenureDays}d` : '--',
              weight: '10%',
              description: 'Time active on the network',
            },
          ].map(item => (
            <View key={item.label} style={styles.breakdownRow}>
              <View style={styles.breakdownLeft}>
                <Text style={[styles.breakdownLabel, isDark && styles.textDark]}>
                  {item.label}
                </Text>
                <Text style={[styles.breakdownDesc, isDark && styles.subtitleDark]}>
                  {item.description}
                </Text>
              </View>
              <View style={styles.breakdownRight}>
                <Text style={[styles.breakdownValue, isDark && styles.textDark]}>
                  {item.value}
                </Text>
                <Text style={[styles.breakdownWeight, isDark && styles.subtitleDark]}>
                  {item.weight}
                </Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Career Statistics
        </Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {agent?.tasksCompleted || 0}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              Tasks Completed
            </Text>
          </View>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {agent?.disputeCount || 0}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              Disputes
            </Text>
          </View>
        </View>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {agent?.tenureDays || 0}d
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              Tenure
            </Text>
          </View>
          <View style={[styles.statCard, isDark && styles.cardDark]}>
            <Text style={[styles.statValue, isDark && styles.textDark]}>
              {agent?.avgQuality ? `${agent.avgQuality}%` : '--'}
            </Text>
            <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
              Avg Quality
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
          Skills
        </Text>
        <View style={[styles.skillsCard, isDark && styles.cardDark]}>
          {agent?.skills?.length ? (
            agent.skills.map(skill => (
              <View key={skill} style={styles.skillRow}>
                <View style={styles.skillBadge}>
                  <Text style={styles.skillText}>
                    {AGENT_SKILLS[skill]?.label || skill}
                  </Text>
                </View>
                <Text style={[styles.skillDesc, isDark && styles.subtitleDark]}>
                  {AGENT_SKILLS[skill]?.description || ''}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.noSkills, isDark && styles.subtitleDark]}>
              No skills configured
            </Text>
          )}
        </View>

        <View style={[styles.dkgCard, isDark && styles.cardDark]}>
          <Text style={[styles.dkgTitle, isDark && styles.textDark]}>
            Stored on OriginTrail DKG
          </Text>
          <Text style={[styles.dkgDesc, isDark && styles.subtitleDark]}>
            Your reputation is permanently stored on the Decentralized Knowledge
            Graph. This creates an immutable record of your agent's career that
            follows them forever.
          </Text>
          <Pressable style={styles.dkgButton}>
            <Text style={styles.dkgButtonText}>View on DKG Explorer</Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getNextTier(currentTier: string | undefined) {
  const tiers = ['unverified', 'bronze', 'silver', 'gold', 'platinum'];
  const currentIndex = tiers.indexOf(currentTier || 'unverified');
  if (currentIndex === -1 || currentIndex === tiers.length - 1) return null;
  return tiers[currentIndex + 1] as keyof typeof TIER_THRESHOLDS;
}

function getProgressToNextTier(creditScore: number, currentTier: string | undefined) {
  const nextTier = getNextTier(currentTier);
  if (!nextTier) return 100;

  const currentThreshold = TIER_THRESHOLDS[currentTier as keyof typeof TIER_THRESHOLDS] || 0;
  const nextThreshold = TIER_THRESHOLDS[nextTier];
  const range = nextThreshold - currentThreshold;
  const progress = creditScore - currentThreshold;

  return Math.min(100, Math.max(0, (progress / range) * 100));
}

function calculateReliability(tasksCompleted: number) {
  if (tasksCompleted === 0) return '--';
  if (tasksCompleted < 5) return 'New';
  if (tasksCompleted < 20) return 'Building';
  return 'Reliable';
}

function calculateDisputeScore(disputes: number, tasks: number) {
  if (tasks === 0) return '--';
  const rate = disputes / tasks;
  if (rate === 0) return 'Perfect';
  if (rate < 0.05) return 'Excellent';
  if (rate < 0.1) return 'Good';
  return 'Needs Improvement';
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 20,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  textDark: {
    color: '#fff',
  },
  profileCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: '#374151',
  },
  agentName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  personalityText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
  },
  tierBadge: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  scoreCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  scoreLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 64,
    fontWeight: '700',
  },
  progressSection: {
    width: '100%',
    marginTop: 16,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  breakdownCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  breakdownLeft: {
    flex: 1,
    marginRight: 16,
  },
  breakdownLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  breakdownDesc: {
    fontSize: 12,
    color: '#9ca3af',
  },
  breakdownRight: {
    alignItems: 'flex-end',
  },
  breakdownValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  breakdownWeight: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
    textAlign: 'center',
  },
  skillsCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  skillRow: {
    marginBottom: 12,
  },
  skillBadge: {
    backgroundColor: '#8b5cf6',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 4,
  },
  skillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  skillDesc: {
    fontSize: 12,
    color: '#6b7280',
  },
  noSkills: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    padding: 16,
  },
  dkgCard: {
    backgroundColor: '#f5f3ff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
  },
  dkgTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#5b21b6',
    marginBottom: 8,
  },
  dkgDesc: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
    marginBottom: 16,
  },
  dkgButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  dkgButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
