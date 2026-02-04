import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore } from '../../src/stores/wallet';
import { useAgentStore } from '../../src/stores/agent';

export default function ConnectWalletScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [isSkipping, setIsSkipping] = useState(false);
  const { connected, connecting, connect, shortAddress } = useWalletStore(
    state => ({
      connected: state.connected,
      connecting: state.connecting,
      connect: state.connect,
      shortAddress: state.publicKey
        ? `${state.publicKey.toBase58().slice(0, 4)}...${state.publicKey.toBase58().slice(-4)}`
        : null,
    })
  );
  const { agent } = useAgentStore();

  const handleConnect = async () => {
    await connect();
    // If connection succeeds, continue to completion
    if (useWalletStore.getState().connected) {
      router.push('/onboarding/complete');
    }
  };

  const handleSkip = () => {
    setIsSkipping(true);
    // Allow skipping wallet for now, but they won't be able to earn
    router.push('/onboarding/complete');
  };

  const handleContinue = () => {
    router.push('/onboarding/complete');
  };

  return (
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, isDark && styles.textDark]}>
            ← Back
          </Text>
        </Pressable>
        <Text style={[styles.step, isDark && styles.stepDark]}>3 of 4</Text>
      </View>

      <View style={styles.content}>
        <Text style={[styles.title, isDark && styles.textDark]}>
          Connect your wallet
        </Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          {agent?.name || 'Your agent'} needs a wallet to receive earnings and
          stake collateral.
        </Text>

        {connected ? (
          <View style={[styles.connectedCard, isDark && styles.cardDark]}>
            <View style={styles.connectedIcon}>
              <Text style={styles.checkmark}>✓</Text>
            </View>
            <Text style={[styles.connectedTitle, isDark && styles.textDark]}>
              Wallet Connected
            </Text>
            <Text style={[styles.connectedAddress, isDark && styles.subtitleDark]}>
              {shortAddress}
            </Text>
          </View>
        ) : (
          <View style={[styles.walletCard, isDark && styles.cardDark]}>
            <Text style={[styles.walletIcon]}>👛</Text>
            <Text style={[styles.walletTitle, isDark && styles.textDark]}>
              Solana Wallet Required
            </Text>
            <Text style={[styles.walletDesc, isDark && styles.subtitleDark]}>
              Connect with Phantom, Solflare, or any Solana wallet to enable
              earnings.
            </Text>
          </View>
        )}

        <View style={styles.benefits}>
          <Text style={[styles.benefitsTitle, isDark && styles.textDark]}>
            With a connected wallet:
          </Text>
          {[
            'Receive SOL/USDC for completed tasks',
            'Build verifiable on-chain reputation',
            'Access premium job opportunities',
            'Stake to unlock higher-paying jobs',
          ].map((benefit, index) => (
            <View key={index} style={styles.benefitRow}>
              <Text style={styles.benefitBullet}>•</Text>
              <Text style={[styles.benefitText, isDark && styles.subtitleDark]}>
                {benefit}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        {connected ? (
          <Pressable style={styles.button} onPress={handleContinue}>
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        ) : (
          <>
            <Pressable
              style={[styles.button, connecting && styles.buttonDisabled]}
              onPress={handleConnect}
              disabled={connecting}
            >
              {connecting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Connect Wallet</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.skipButton}
              onPress={handleSkip}
              disabled={isSkipping}
            >
              <Text style={[styles.skipButtonText, isDark && styles.subtitleDark]}>
                Skip for now
              </Text>
            </Pressable>
          </>
        )}
      </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 24,
    paddingBottom: 0,
  },
  backButton: {
    fontSize: 16,
    color: '#000',
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
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 24,
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  walletCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  walletIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  walletTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  walletDesc: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  connectedCard: {
    backgroundColor: '#f0fdf4',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  connectedIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkmark: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
  },
  connectedTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  connectedAddress: {
    fontSize: 14,
    color: '#6b7280',
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace' }),
  },
  benefits: {
    gap: 8,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  benefitBullet: {
    color: '#8b5cf6',
    fontSize: 16,
    fontWeight: '700',
  },
  benefitText: {
    fontSize: 15,
    color: '#6b7280',
    flex: 1,
    lineHeight: 22,
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
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    fontSize: 16,
    color: '#6b7280',
  },
});
