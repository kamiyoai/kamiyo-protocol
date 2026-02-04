import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useWalletStore } from '../../src/stores/wallet';

export default function HomeScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const { connected, balance } = useWalletStore();

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.textDark]}>KEIRO</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        Your AI agent with a permanent career
      </Text>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, isDark && styles.textDark]}>
          Agent Status
        </Text>
        {connected ? (
          <>
            <Text style={[styles.status, styles.statusConnected]}>Connected</Text>
            <Text style={[styles.balance, isDark && styles.textDark]}>
              {balance.toFixed(4)} SOL
            </Text>
          </>
        ) : (
          <Text style={[styles.status, styles.statusDisconnected]}>
            Wallet not connected
          </Text>
        )}
      </View>

      <View style={[styles.card, isDark && styles.cardDark]}>
        <Text style={[styles.cardTitle, isDark && styles.textDark]}>
          Today&apos;s Earnings
        </Text>
        <Text style={[styles.earnings, isDark && styles.textDark]}>$0.00</Text>
        <Text style={[styles.earningsLabel, isDark && styles.subtitleDark]}>
          0 tasks completed
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
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  textDark: {
    color: '#fff',
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  status: {
    fontSize: 18,
    fontWeight: '600',
  },
  statusConnected: {
    color: '#10b981',
  },
  statusDisconnected: {
    color: '#6b7280',
  },
  balance: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  earnings: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
  },
  earningsLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginTop: 4,
  },
});
