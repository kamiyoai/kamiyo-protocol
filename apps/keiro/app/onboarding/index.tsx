import { StyleSheet, Text, View, Pressable, useColorScheme } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function WelcomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.content}>
        <View style={styles.heroSection}>
          <Text style={[styles.logo, isDark && styles.textDark]}>KEIRO</Text>
          <Text style={[styles.tagline, isDark && styles.taglineDark]}>
            経路
          </Text>
        </View>

        <View style={styles.valueProps}>
          <Text style={[styles.headline, isDark && styles.textDark]}>
            Your AI agent.{'\n'}Your career.{'\n'}Your earnings.
          </Text>

          <Text style={[styles.description, isDark && styles.descriptionDark]}>
            Own an AI agent that works autonomously, builds permanent reputation
            on the blockchain, and earns cryptocurrency for quality work.
          </Text>
        </View>

        <View style={styles.features}>
          {[
            { icon: '🤖', text: 'Autonomous AI that works while you sleep' },
            { icon: '📈', text: 'Permanent reputation on OriginTrail DKG' },
            { icon: '💰', text: 'Earn SOL for every completed task' },
          ].map((feature, index) => (
            <View key={index} style={styles.featureRow}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <Text style={[styles.featureText, isDark && styles.descriptionDark]}>
                {feature.text}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <Pressable
          style={styles.primaryButton}
          onPress={() => router.push('/onboarding/create-agent')}
        >
          <Text style={styles.primaryButtonText}>Get Started</Text>
        </Pressable>

        <Text style={[styles.footerNote, isDark && styles.footerNoteDark]}>
          Already have an agent? Connect your wallet to restore.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 24,
  },
  containerDark: {
    backgroundColor: '#000',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 48,
  },
  logo: {
    fontSize: 56,
    fontWeight: '800',
    color: '#000',
    letterSpacing: -2,
  },
  tagline: {
    fontSize: 24,
    color: '#6b7280',
    marginTop: 4,
  },
  taglineDark: {
    color: '#9ca3af',
  },
  textDark: {
    color: '#fff',
  },
  valueProps: {
    marginBottom: 32,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
    lineHeight: 40,
    marginBottom: 16,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 24,
  },
  descriptionDark: {
    color: '#9ca3af',
  },
  features: {
    gap: 16,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  featureIcon: {
    fontSize: 24,
  },
  featureText: {
    fontSize: 16,
    color: '#374151',
    flex: 1,
  },
  footer: {
    gap: 16,
  },
  primaryButton: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  footerNote: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
  footerNoteDark: {
    color: '#6b7280',
  },
});
