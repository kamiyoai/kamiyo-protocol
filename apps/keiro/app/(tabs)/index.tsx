import {
  StyleSheet,
  Text,
  View,
  useColorScheme,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { useState, useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore } from '../../src/stores/wallet';
import { useAgentStore } from '../../src/stores/agent';
import { TIER_COLORS, AGENT_SKILLS } from '../../src/lib/constants';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const [refreshing, setRefreshing] = useState(false);

  const { connected, balance, refreshBalance } = useWalletStore();
  const { agent } = useAgentStore();

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refreshBalance();
    setRefreshing(false);
  }, [refreshBalance]);

  const tierColor = agent?.tier ? TIER_COLORS[agent.tier] : '#6b7280';

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
        <View style={styles.header}>
          <View>
            <Text style={[styles.greeting, isDark && styles.subtitleDark]}>
              {getGreeting()}
            </Text>
            <Text style={[styles.agentName, isDark && styles.textDark]}>
              {agent?.name || 'Your Agent'}
            </Text>
          </View>
          <View
            style={[
              styles.statusBadge,
              agent?.isActive ? styles.statusActive : styles.statusInactive,
            ]}
          >
            <View
              style={[
                styles.statusDot,
                agent?.isActive ? styles.dotActive : styles.dotInactive,
              ]}
            />
            <Text style={styles.statusText}>
              {agent?.isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.cardRow}>
            <View style={styles.cardColumn}>
              <Text style={[styles.cardLabel, isDark && styles.subtitleDark]}>
                Credit Score
              </Text>
              <Text style={[styles.cardValue, isDark && styles.textDark]}>
                {agent?.creditScore || 0}
              </Text>
            </View>
            <View style={styles.cardColumn}>
              <Text style={[styles.cardLabel, isDark && styles.subtitleDark]}>
                Tier
              </Text>
              <View style={[styles.tierBadge, { backgroundColor: tierColor }]}>
                <Text style={styles.tierText}>
                  {agent?.tier
                    ? agent.tier.charAt(0).toUpperCase() + agent.tier.slice(1)
                    : 'Unverified'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Today's Performance
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, isDark && styles.textDark]}>
                $0.00
              </Text>
              <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
                Earned
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, isDark && styles.textDark]}>0</Text>
              <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
                Tasks
              </Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, isDark && styles.textDark]}>
                --
              </Text>
              <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
                Avg Quality
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Wallet
          </Text>
          {connected ? (
            <View style={styles.walletConnected}>
              <Text style={[styles.balanceValue, isDark && styles.textDark]}>
                {balance.toFixed(4)} SOL
              </Text>
              <Text style={[styles.balanceUsd, isDark && styles.subtitleDark]}>
                ≈ ${(balance * 150).toFixed(2)} USD
              </Text>
            </View>
          ) : (
            <View style={styles.walletDisconnected}>
              <Text style={[styles.walletWarning, isDark && styles.subtitleDark]}>
                No wallet connected
              </Text>
              <Text style={[styles.walletHint, isDark && styles.subtitleDark]}>
                Connect a wallet to receive earnings
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Active Skills
          </Text>
          <View style={styles.skillsGrid}>
            {agent?.skills?.length ? (
              agent.skills.map(skill => (
                <View key={skill} style={styles.skillBadge}>
                  <Text style={styles.skillText}>
                    {AGENT_SKILLS[skill]?.label || skill}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={[styles.noSkills, isDark && styles.subtitleDark]}>
                No skills configured
              </Text>
            )}
          </View>
        </View>

        <View style={[styles.card, isDark && styles.cardDark]}>
          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Career Stats
          </Text>
          <View style={styles.careerStats}>
            <View style={styles.careerStatRow}>
              <Text style={[styles.careerLabel, isDark && styles.subtitleDark]}>
                Tasks Completed
              </Text>
              <Text style={[styles.careerValue, isDark && styles.textDark]}>
                {agent?.tasksCompleted || 0}
              </Text>
            </View>
            <View style={styles.careerStatRow}>
              <Text style={[styles.careerLabel, isDark && styles.subtitleDark]}>
                Disputes
              </Text>
              <Text style={[styles.careerValue, isDark && styles.textDark]}>
                {agent?.disputeCount || 0}
              </Text>
            </View>
            <View style={styles.careerStatRow}>
              <Text style={[styles.careerLabel, isDark && styles.subtitleDark]}>
                Tenure
              </Text>
              <Text style={[styles.careerValue, isDark && styles.textDark]}>
                {agent?.tenureDays || 0} days
              </Text>
            </View>
            <View style={styles.careerStatRow}>
              <Text style={[styles.careerLabel, isDark && styles.subtitleDark]}>
                Avg Quality
              </Text>
              <Text style={[styles.careerValue, isDark && styles.textDark]}>
                {agent?.avgQuality ? `${agent.avgQuality}%` : '--'}
              </Text>
            </View>
          </View>
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
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000',
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: '#6b7280',
  },
  agentName: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusActive: {
    backgroundColor: '#dcfce7',
  },
  statusInactive: {
    backgroundColor: '#f3f4f6',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#22c55e',
  },
  dotInactive: {
    backgroundColor: '#9ca3af',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cardColumn: {
    alignItems: 'center',
    flex: 1,
  },
  cardLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  cardValue: {
    fontSize: 36,
    fontWeight: '700',
    color: '#000',
  },
  tierBadge: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  walletConnected: {
    alignItems: 'center',
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
  },
  balanceUsd: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  walletDisconnected: {
    alignItems: 'center',
    padding: 12,
  },
  walletWarning: {
    fontSize: 16,
    fontWeight: '600',
    color: '#f59e0b',
  },
  walletHint: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
  skillsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillBadge: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  skillText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#fff',
  },
  noSkills: {
    fontSize: 14,
    color: '#6b7280',
  },
  careerStats: {
    gap: 12,
  },
  careerStatRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  careerLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  careerValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
});
