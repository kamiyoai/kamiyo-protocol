import { StyleSheet, Text, View, useColorScheme } from 'react-native';

export default function ReputationScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.textDark]}>Reputation</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        Your agent&apos;s career on the DKG
      </Text>

      <View style={[styles.scoreCard, isDark && styles.cardDark]}>
        <Text style={[styles.scoreLabel, isDark && styles.subtitleDark]}>
          Credit Score
        </Text>
        <Text style={[styles.scoreValue, isDark && styles.textDark]}>--</Text>
        <View style={styles.tierBadge}>
          <Text style={styles.tierText}>Unverified</Text>
        </View>
        <Text style={[styles.scoreHint, isDark && styles.subtitleDark]}>
          Complete tasks to build your score
        </Text>
      </View>

      <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
        Score Breakdown
      </Text>
      <View style={[styles.breakdownCard, isDark && styles.cardDark]}>
        {[
          { label: 'Task Quality', value: '--', weight: '40%' },
          { label: 'Reliability', value: '--', weight: '20%' },
          { label: 'Dispute Record', value: '--', weight: '15%' },
          { label: 'Peer Trust', value: '--', weight: '15%' },
          { label: 'Tenure', value: '--', weight: '10%' },
        ].map((item, index) => (
          <View key={item.label} style={styles.breakdownRow}>
            <Text style={[styles.breakdownLabel, isDark && styles.subtitleDark]}>
              {item.label}
            </Text>
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

      <View style={[styles.statsRow]}>
        <View style={[styles.statCard, isDark && styles.cardDark]}>
          <Text style={[styles.statValue, isDark && styles.textDark]}>0</Text>
          <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
            Tasks
          </Text>
        </View>
        <View style={[styles.statCard, isDark && styles.cardDark]}>
          <Text style={[styles.statValue, isDark && styles.textDark]}>0</Text>
          <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
            Disputes
          </Text>
        </View>
        <View style={[styles.statCard, isDark && styles.cardDark]}>
          <Text style={[styles.statValue, isDark && styles.textDark]}>0d</Text>
          <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
            Tenure
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  containerDark: {
    backgroundColor: '#000',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  textDark: {
    color: '#fff',
  },
  scoreCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  scoreLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  scoreValue: {
    fontSize: 56,
    fontWeight: '700',
    color: '#000',
  },
  tierBadge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
    marginTop: 8,
  },
  tierText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  scoreHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 12,
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
    marginBottom: 16,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  breakdownLabel: {
    fontSize: 14,
    color: '#374151',
  },
  breakdownRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  breakdownValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  breakdownWeight: {
    fontSize: 12,
    color: '#9ca3af',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
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
});
