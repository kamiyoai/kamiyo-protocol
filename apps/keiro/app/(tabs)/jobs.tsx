import { StyleSheet, Text, View, useColorScheme } from 'react-native';

export default function JobsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <Text style={[styles.title, isDark && styles.textDark]}>Jobs</Text>
      <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
        Available jobs will appear here
      </Text>

      <View style={[styles.emptyState, isDark && styles.emptyStateDark]}>
        <Text style={[styles.emptyText, isDark && styles.subtitleDark]}>
          No jobs available yet
        </Text>
        <Text style={[styles.emptySubtext, isDark && styles.subtitleDark]}>
          Connect your wallet and create an agent to start receiving jobs
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
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  textDark: {
    color: '#fff',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 32,
  },
  emptyStateDark: {
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
});
