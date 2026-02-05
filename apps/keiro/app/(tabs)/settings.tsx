import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Switch,
  Alert,
  Pressable,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAgentStore } from '../../src/stores/agent';
import { useWalletStore, getShortAddress } from '../../src/stores/wallet';
import { useAppStore } from '../../src/stores/app';
import { AGENT_PERSONALITIES, APP_VERSION } from '../../src/lib/constants';
import { colors, typography, spacing } from '../../src/theme';
import {
  TerminalButton,
  TerminalBadge,
  TerminalHeader,
  TerminalDivider,
  DotLeaderRow,
} from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function SettingsScreen() {
  const router = useRouter();

  const { agent, toggleActive, clearAgent } = useAgentStore();
  const { connected, publicKey, disconnect } = useWalletStore();
  const { resetOnboarding } = useAppStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoAcceptJobs, setAutoAcceptJobs] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const handleToggleActive = async () => {
    setTogglingActive(true);
    try {
      await toggleActive();
    } catch (error) {
      console.error('Failed to toggle active:', error);
    } finally {
      setTogglingActive(false);
    }
  };

  const handleDisconnectWallet = () => {
    Alert.alert(
      'Disconnect Wallet',
      'Are you sure you want to disconnect your wallet? You will not be able to receive earnings.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => disconnect(),
        },
      ]
    );
  };

  const handleResetAgent = () => {
    Alert.alert(
      'Reset Agent',
      'This will delete your agent and all local data. Your on-chain reputation will remain on the DKG. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => {
            clearAgent();
            disconnect();
            resetOnboarding();
            router.replace('/onboarding');
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <TerminalHeader command="config" />

        <TerminalDivider label="AGENT" />

        <View style={styles.dataSection}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Text style={styles.switchLabel}>status</Text>
              <TerminalBadge variant="status" active={agent?.isActive || false}>
                {agent?.isActive ? 'ACTIVE' : 'INACTIVE'}
              </TerminalBadge>
            </View>
            <Switch
              value={agent?.isActive || false}
              onValueChange={handleToggleActive}
              trackColor={{ false: colors.gray700, true: 'rgba(153, 68, 255, 0.3)' }}
              thumbColor={agent?.isActive ? colors.violet : colors.gray500}
              disabled={togglingActive}
            />
          </View>

          <DotLeaderRow
            label="name"
            value={agent?.name || 'not set'}
          />
          <DotLeaderRow
            label="personality"
            value={
              agent?.personality
                ? AGENT_PERSONALITIES[agent.personality]?.label?.toLowerCase()
                : 'not set'
            }
          />
          <DotLeaderRow
            label="skills"
            value={`${agent?.skills?.length || 0} active`}
          />
          <DotLeaderRow
            label="created"
            value={
              agent?.createdAt
                ? new Date(agent.createdAt).toLocaleDateString()
                : 'unknown'
            }
          />
        </View>

        <TerminalDivider label="WALLET" />

        <View style={styles.dataSection}>
          {connected ? (
            <>
              <DotLeaderRow
                label="status"
                value="CONNECTED"
                valueColor={colors.violet}
              />
              <DotLeaderRow
                label="address"
                value={getShortAddress(publicKey)}
              />
              <TerminalButton
                variant="danger"
                onPress={handleDisconnectWallet}
                style={styles.actionBtn}
              >
                DISCONNECT WALLET
              </TerminalButton>
            </>
          ) : (
            <>
              <Text style={styles.dimText}>no wallet connected</Text>
              <Text style={styles.dimSubtext}>
                connect a wallet from the earnings tab to receive payments
              </Text>
            </>
          )}
        </View>

        <TerminalDivider label="PREFERENCES" />

        <View style={styles.dataSection}>
          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Text style={styles.switchLabel}>push notifications</Text>
              <TerminalBadge variant={notificationsEnabled ? 'cyan' : 'dim'}>
                {notificationsEnabled ? 'ON' : 'OFF'}
              </TerminalBadge>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: colors.gray700, true: 'rgba(153, 68, 255, 0.3)' }}
              thumbColor={notificationsEnabled ? colors.violet : colors.gray500}
            />
          </View>

          <View style={styles.switchRow}>
            <View style={styles.switchLeft}>
              <Text style={styles.switchLabel}>auto-accept jobs</Text>
              <TerminalBadge variant={autoAcceptJobs ? 'cyan' : 'dim'}>
                {autoAcceptJobs ? 'ON' : 'OFF'}
              </TerminalBadge>
            </View>
            <Switch
              value={autoAcceptJobs}
              onValueChange={setAutoAcceptJobs}
              trackColor={{ false: colors.gray700, true: 'rgba(153, 68, 255, 0.3)' }}
              thumbColor={autoAcceptJobs ? colors.violet : colors.gray500}
              disabled
            />
          </View>
          <Text style={styles.dimSubtext}>coming soon</Text>
        </View>

        <TerminalDivider label="DATA" />

        <View style={styles.dataSection}>
          <TerminalButton variant="danger" onPress={handleResetAgent}>
            RESET AGENT & DATA
          </TerminalButton>
          <Text style={styles.dangerHint}>
            this will delete all local data and restart onboarding.{'\n'}
            your on-chain reputation is permanent.
          </Text>
        </View>

        <TerminalDivider label="ABOUT" />

        <View style={styles.dataSection}>
          <DotLeaderRow label="version" value={APP_VERSION} />
          <DotLeaderRow label="network" value="devnet" />

          <View style={styles.linksSection}>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>{'>'} terms of service</Text>
            </Pressable>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>{'>'} privacy policy</Text>
            </Pressable>
            <Pressable style={styles.linkRow}>
              <Text style={styles.linkText}>{'>'} view on github</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>KAMIYO PROTOCOL</Text>
          <Text style={styles.footerSubtext}>
            ai agents with permanent careers on origintrail dkg
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg.primary,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.xl,
  },
  dataSection: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  switchLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  switchLabel: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
  },
  dimText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
  },
  dimSubtext: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    marginTop: spacing.xs,
  },
  actionBtn: {
    marginTop: spacing.md,
  },
  dangerHint: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 16,
  },
  linksSection: {
    marginTop: spacing.lg,
  },
  linkRow: {
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.white,
  },
  footer: {
    alignItems: 'center',
    paddingVertical: spacing['3xl'],
  },
  footerText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    letterSpacing: typography.letterSpacing.wide,
  },
  footerSubtext: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray600,
    marginTop: spacing.xs,
  },
});
