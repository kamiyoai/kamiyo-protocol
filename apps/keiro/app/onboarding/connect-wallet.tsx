import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWalletStore, getShortAddress } from '../../src/stores/wallet';
import { useAgentStore } from '../../src/stores/agent';
import { colors, typography, spacing } from '../../src/theme';
import { TerminalHeader, TerminalFrame, TerminalDivider, Badge, Button, ScanlineOverlay } from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function ConnectWalletScreen() {
  const router = useRouter();

  const [isSkipping, setIsSkipping] = useState(false);
  const connected = useWalletStore((s) => s.connected);
  const connecting = useWalletStore((s) => s.connecting);
  const connect = useWalletStore((s) => s.connect);
  const publicKeyBase58 = useWalletStore((s) => s.publicKeyBase58);
  const shortAddress = getShortAddress(publicKeyBase58);
  const { agent } = useAgentStore();

  const handleConnect = async () => {
    await connect();
    if (useWalletStore.getState().connected) {
      router.push('/onboarding/complete');
    }
  };

  const handleSkip = () => {
    setIsSkipping(true);
    router.push('/onboarding/complete');
  };

  const handleContinue = () => {
    router.push('/onboarding/complete');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TerminalHeader command="connect-wallet" />
          <Text style={styles.step}>[3/4]</Text>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>connect your wallet</Text>
          <Text style={styles.subtitle}>
            {agent?.name || 'your agent'} needs a wallet to receive earnings and
            stake collateral.
          </Text>

          {connected ? (
            <TerminalFrame title="WALLET" accent={colors.accent}>
              <View style={styles.walletContent}>
                <Badge variant="status" active>CONNECTED</Badge>
                <Text style={styles.connectedAddress}>{shortAddress}</Text>
              </View>
            </TerminalFrame>
          ) : (
            <TerminalFrame title="WALLET">
              <View style={styles.walletContent}>
                <Badge variant="status" active={false}>NOT CONNECTED</Badge>
                <Text style={styles.walletDesc}>
                  connect with phantom, solflare, or any solana wallet to enable
                  earnings.
                </Text>
              </View>
            </TerminalFrame>
          )}

          <TerminalDivider label="BENEFITS" marginVertical={spacing.xl} />

          <View style={styles.benefits}>
            {[
              'receive SOL/USDC for completed tasks',
              'build verifiable on-chain reputation',
              'access premium job opportunities',
              'stake to unlock higher-paying jobs',
            ].map((benefit, index) => (
              <Text key={index} style={styles.benefitRow}>
                <Text style={styles.benefitMarkerText}>
                  {String(index + 1).padStart(2, '0')}
                </Text>
                <Text style={styles.benefitSeparator}> │ </Text>
                <Text style={styles.benefitText}>{benefit}</Text>
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          {connected ? (
            <Button onPress={handleContinue} style={{ width: '100%' }}>
              Continue
            </Button>
          ) : (
            <>
              <Button
                onPress={handleConnect}
                loading={connecting}
                style={{ width: '100%' }}
              >
                Connect Wallet
              </Button>

              <Button
                variant="ghost"
                onPress={handleSkip}
                disabled={isSkipping}
              >
                skip for now
              </Button>
            </>
          )}

          <Button variant="ghost" onPress={() => router.back()}>
            back
          </Button>
        </View>
      </SafeAreaView>
      <ScanlineOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  container: {
    flex: 1,
    padding: spacing['2xl'],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  step: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    letterSpacing: typography.letterSpacing.wide,
  },
  content: {
    flex: 1,
  },
  title: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.white,
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily,
    fontSize: typography.fontSize.base,
    color: colors.bodyText,
    marginBottom: spacing.xl,
  },
  walletContent: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  connectedAddress: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
  },
  walletDesc: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    textAlign: 'center',
    lineHeight: 20,
  },
  benefits: {
    gap: spacing.md,
  },
  benefitRow: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    lineHeight: 22,
  },
  benefitMarkerText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.accent,
  },
  benefitSeparator: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
  },
  benefitText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.bodyText,
  },
  footer: {
    gap: spacing.md,
    alignItems: 'center',
  },
});
