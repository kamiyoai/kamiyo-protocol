import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
} from 'react-native';
import { useWalletStore } from '../../src/stores/wallet';

export default function EarningsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { connected, balance, connect, connecting } = useWalletStore();

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.textDark]}>Earnings</Text>

      <View style={[styles.balanceCard, isDark && styles.cardDark]}>
        <Text style={[styles.balanceLabel, isDark && styles.subtitleDark]}>
          Total Balance
        </Text>
        <Text style={[styles.balanceAmount, isDark && styles.textDark]}>
          ${(balance * 150).toFixed(2)}
        </Text>
        <Text style={[styles.balanceSol, isDark && styles.subtitleDark]}>
          ≈ {balance.toFixed(4)} SOL
        </Text>

        {!connected && (
          <Pressable
            style={[styles.button, connecting && styles.buttonDisabled]}
            onPress={connect}
            disabled={connecting}
          >
            <Text style={styles.buttonText}>
              {connecting ? 'Connecting...' : 'Connect Wallet'}
            </Text>
          </Pressable>
        )}
      </View>

      <View style={styles.statsRow}>
        <View style={[styles.statCard, isDark && styles.cardDark]}>
          <Text style={[styles.statValue, isDark && styles.textDark]}>
            $0.00
          </Text>
          <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
            Today
          </Text>
        </View>
        <View style={[styles.statCard, isDark && styles.cardDark]}>
          <Text style={[styles.statValue, isDark && styles.textDark]}>
            $0.00
          </Text>
          <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
            This Week
          </Text>
        </View>
        <View style={[styles.statCard, isDark && styles.cardDark]}>
          <Text style={[styles.statValue, isDark && styles.textDark]}>
            $0.00
          </Text>
          <Text style={[styles.statLabel, isDark && styles.subtitleDark]}>
            This Month
          </Text>
        </View>
      </View>

      <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
        Transaction History
      </Text>
      <View style={[styles.emptyState, isDark && styles.cardDark]}>
        <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
          No transactions yet
        </Text>
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
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 40,
    fontWeight: '700',
    color: '#000',
  },
  balanceSol: {
    fontSize: 16,
    color: '#6b7280',
    marginTop: 4,
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  emptyState: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#6b7280',
  },
});
