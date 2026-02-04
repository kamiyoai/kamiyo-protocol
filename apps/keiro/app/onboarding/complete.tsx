import { useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore } from '../../src/stores/agent';
import { useWalletStore } from '../../src/stores/wallet';
import { useAppStore } from '../../src/stores/app';

export default function CompleteScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const { agent, setActive } = useAgentStore();
  const { connected } = useWalletStore();
  const { completeOnboarding } = useAppStore();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Entrance animation
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleActivate = () => {
    setActive(true);
    completeOnboarding();
    router.replace('/(tabs)');
  };

  const handleViewProfile = () => {
    completeOnboarding();
    router.replace('/(tabs)/reputation');
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Text style={[styles.step, isDark && styles.stepDark]}>4 of 4</Text>
      </View>

      <View style={styles.content}>
        <Animated.View
          style={[
            styles.successIcon,
            {
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          <Text style={styles.successEmoji}>🎉</Text>
        </Animated.View>

        <Animated.View style={{ opacity: fadeAnim }}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            {agent?.name} is ready!
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
            Your AI agent has been created and is ready to start working.
          </Text>
        </Animated.View>

        <Animated.View style={[styles.summaryCard, isDark && styles.cardDark, { opacity: fadeAnim }]}>
          <Text style={[styles.summaryTitle, isDark && styles.textDark]}>
            Agent Summary
          </Text>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Name
            </Text>
            <Text style={[styles.summaryValue, isDark && styles.textDark]}>
              {agent?.name}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Personality
            </Text>
            <Text style={[styles.summaryValue, isDark && styles.textDark]}>
              {agent?.personality
                ? agent.personality.charAt(0).toUpperCase() +
                  agent.personality.slice(1)
                : 'Not set'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Skills
            </Text>
            <Text style={[styles.summaryValue, isDark && styles.textDark]}>
              {agent?.skills?.length || 0} selected
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Wallet
            </Text>
            <Text
              style={[
                styles.summaryValue,
                connected ? styles.connected : styles.notConnected,
              ]}
            >
              {connected ? 'Connected' : 'Not connected'}
            </Text>
          </View>

          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isDark && styles.subtitleDark]}>
              Tier
            </Text>
            <View style={styles.tierBadge}>
              <Text style={styles.tierText}>Unverified</Text>
            </View>
          </View>
        </Animated.View>

        {!connected && (
          <Animated.View style={[styles.warning, { opacity: fadeAnim }]}>
            <Text style={styles.warningText}>
              ⚠️ Without a wallet, your agent cannot receive earnings. You can
              connect one later in Settings.
            </Text>
          </Animated.View>
        )}
      </View>

      <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
        <Pressable style={styles.button} onPress={handleActivate}>
          <Text style={styles.buttonText}>Activate Agent</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={handleViewProfile}>
          <Text style={[styles.secondaryButtonText, isDark && styles.subtitleDark]}>
            View Agent Profile
          </Text>
        </Pressable>
      </Animated.View>
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
    padding: 24,
    alignItems: 'flex-end',
  },
  step: {
    fontSize: 14,
    color: '#9ca3af',
  },
  stepDark: {
    color: '#6b7280',
  },
  textDark: {
    color: '#fff',
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
  },
  successIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#f0fdf4',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  successEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  summaryCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 20,
    width: '100%',
    gap: 16,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  connected: {
    color: '#10b981',
  },
  notConnected: {
    color: '#f59e0b',
  },
  tierBadge: {
    backgroundColor: '#e5e7eb',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  tierText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  warning: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    width: '100%',
  },
  warningText: {
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },
  footer: {
    padding: 24,
    gap: 12,
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 16,
    color: '#6b7280',
  },
});
