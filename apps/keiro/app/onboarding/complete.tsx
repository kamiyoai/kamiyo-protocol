import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Animated,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore } from '../../src/stores/agent';
import { useWalletStore } from '../../src/stores/wallet';
import { useAppStore } from '../../src/stores/app';
import { api } from '../../src/lib/api';
import { registerAgentOnChain } from '../../src/lib/on-chain';
import { successNotification } from '../../src/lib/haptics';
import { colors, typography, spacing } from '../../src/theme';
import { TerminalHeader, TerminalFrame, DotLeaderRow, Button, ScanlineOverlay } from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function CompleteScreen() {
  const router = useRouter();
  const [activating, setActivating] = useState(false);
  const [statusText, setStatusText] = useState('');

  const { agent } = useAgentStore();
  const { connected, publicKey } = useWalletStore();
  const publicKeyBase58 = useWalletStore((s) => s.publicKeyBase58);
  const authToken = useWalletStore((s) => s.authToken);
  const { completeOnboarding } = useAppStore();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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

  const handleActivate = async () => {
    if (!agent) return;

    setActivating(true);
    try {
      const walletAddress = publicKey?.toString() || null;

      // Step 1: Create agent record on API
      setStatusText('syncing with server...');
      const isApiUp = walletAddress ? await api.health() : false;

      let updatedAgent = { ...agent, isActive: true };

      if (isApiUp && walletAddress) {
        const serverAgent = await api.createAgent({
          walletAddress,
          name: agent.name,
          personality: agent.personality,
          skills: agent.skills,
        });
        updatedAgent = { ...serverAgent, isActive: true };
        await api.toggleAgentActive(serverAgent.id).catch(() => {});
      }

      // Step 2: Register on-chain if wallet connected (native only)
      if (walletAddress && publicKeyBase58 && Platform.OS !== 'web') {
        setStatusText('registering on-chain...');
        try {
          const result = await registerAgentOnChain(
            publicKeyBase58,
            authToken,
            agent.name,
            agent.personality
          );
          updatedAgent.agentPda = result.agentPda;
          updatedAgent.onChainSignature = result.signature;
        } catch {
          setStatusText('on-chain registration skipped');
        }
      }

      useAgentStore.setState({
        agent: updatedAgent,
        ...(walletAddress && { walletAddress }),
      });

      successNotification();
      completeOnboarding();
      router.replace('/(tabs)');
    } catch {
      useAgentStore.setState({
        agent: { ...agent, isActive: true },
      });
      completeOnboarding();
      router.replace('/(tabs)');
    } finally {
      setActivating(false);
      setStatusText('');
    }
  };

  const handleViewProfile = async () => {
    if (!agent) {
      completeOnboarding();
      router.replace('/(tabs)/reputation');
      return;
    }

    setActivating(true);
    try {
      const walletAddress = publicKey?.toString() || null;
      const isApiUp = walletAddress ? await api.health() : false;

      if (isApiUp && walletAddress) {
        const serverAgent = await api.createAgent({
          walletAddress,
          name: agent.name,
          personality: agent.personality,
          skills: agent.skills,
        });

        useAgentStore.setState({
          agent: serverAgent,
          walletAddress,
        });
      } else if (walletAddress) {
        useAgentStore.setState({ walletAddress });
      }
    } catch {
      setStatusText('');
    } finally {
      setActivating(false);
      completeOnboarding();
      router.replace('/(tabs)/reputation');
    }
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TerminalHeader command="activate" />
          <Text style={styles.step}>[4/4]</Text>
        </View>

        <View style={styles.content}>
          <Animated.View
            style={[
              styles.okIndicator,
              {
                transform: [{ scale: scaleAnim }],
              },
            ]}
          >
            <Text style={styles.okText}>[OK]</Text>
          </Animated.View>

          <Animated.View style={{ opacity: fadeAnim }}>
            <Text style={styles.title}>{agent?.name} is ready</Text>
            <Text style={styles.subtitle}>
              your AI agent has been created and is ready to start working.
            </Text>
          </Animated.View>

          <Animated.View style={[{ opacity: fadeAnim, width: '100%' }]}>
            <TerminalFrame title="AGENT SUMMARY">
              <DotLeaderRow
                label="name"
                value={agent?.name || '---'}
              />
              <DotLeaderRow
                label="personality"
                value={agent?.personality || 'not set'}
              />
              <DotLeaderRow
                label="skills"
                value={`${agent?.skills?.length || 0} selected`}
              />
              <DotLeaderRow
                label="wallet"
                value={connected ? 'CONNECTED' : 'NOT CONNECTED'}
                valueColor={connected ? colors.violet : colors.orange500}
              />
              <DotLeaderRow
                label="tier"
                value="UNVERIFIED"
                valueColor={colors.gray500}
              />
            </TerminalFrame>
          </Animated.View>

          {!connected && (
            <Animated.View style={[styles.warningWrapper, { opacity: fadeAnim }]}>
              <TerminalFrame accent={colors.orange500}>
                <Text style={styles.warningText}>
                  without a wallet, your agent cannot receive earnings. you can
                  connect one later in settings.
                </Text>
              </TerminalFrame>
            </Animated.View>
          )}
        </View>

        <Animated.View style={[styles.footer, { opacity: fadeAnim }]}>
          {statusText ? (
            <Text style={styles.statusText}>{statusText}</Text>
          ) : null}
          <Button
            onPress={handleActivate}
            loading={activating}
            style={{ width: '100%' }}
          >
            Activate Agent
          </Button>

          <Button
            variant="secondary"
            onPress={handleViewProfile}
            disabled={activating}
            style={{ width: '100%' }}
          >
            View Profile
          </Button>
        </Animated.View>
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
    alignItems: 'center',
  },
  okIndicator: {
    marginBottom: spacing.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    borderWidth: 1,
    borderColor: colors.violet,
    backgroundColor: 'rgba(153, 68, 255, 0.1)',
  },
  okText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize['3xl'],
    fontWeight: '700',
    color: colors.violet,
    letterSpacing: typography.letterSpacing.wider,
  },
  title: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: colors.white,
    textAlign: 'center',
    letterSpacing: typography.letterSpacing.wide,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontFamily,
    fontSize: typography.fontSize.base,
    color: colors.bodyText,
    textAlign: 'center',
    marginBottom: spacing['2xl'],
  },
  warningWrapper: {
    marginTop: spacing.lg,
    width: '100%',
  },
  warningText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.orange500,
    lineHeight: 20,
  },
  footer: {
    gap: spacing.md,
  },
  statusText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.violet,
    textAlign: 'center',
    letterSpacing: typography.letterSpacing.wide,
  },
});
