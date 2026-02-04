import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAgentStore } from '../../src/stores/agent';
import { useWalletStore, getShortAddress } from '../../src/stores/wallet';
import { useAppStore } from '../../src/stores/app';
import { AGENT_PERSONALITIES, AGENT_SKILLS, APP_VERSION } from '../../src/lib/constants';

export default function SettingsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const router = useRouter();

  const { agent, setActive, clearAgent } = useAgentStore();
  const { connected, publicKey, disconnect } = useWalletStore();
  const { resetOnboarding } = useAppStore();

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [autoAcceptJobs, setAutoAcceptJobs] = useState(false);

  const handleToggleActive = () => {
    setActive(!agent?.isActive);
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
    <SafeAreaView
      style={[styles.container, isDark && styles.containerDark]}
      edges={['top']}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, isDark && styles.textDark]}>Settings</Text>

        <Text style={[styles.sectionLabel, isDark && styles.subtitleDark]}>
          AGENT
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={[styles.settingLabel, isDark && styles.textDark]}>
                Agent Status
              </Text>
              <Text style={[styles.settingDesc, isDark && styles.subtitleDark]}>
                {agent?.isActive
                  ? 'Agent is accepting jobs'
                  : 'Agent is paused'}
              </Text>
            </View>
            <Switch
              value={agent?.isActive || false}
              onValueChange={handleToggleActive}
              trackColor={{ false: '#e5e7eb', true: '#c4b5fd' }}
              thumbColor={agent?.isActive ? '#8b5cf6' : '#fff'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
              Name
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {agent?.name || 'Not set'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
              Personality
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {agent?.personality
                ? AGENT_PERSONALITIES[agent.personality]?.label
                : 'Not set'}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
              Skills
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {agent?.skills?.length || 0} active
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
              Created
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {agent?.createdAt
                ? new Date(agent.createdAt).toLocaleDateString()
                : 'Unknown'}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionLabel, isDark && styles.subtitleDark]}>
          WALLET
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          {connected ? (
            <>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
                  Status
                </Text>
                <View style={styles.connectedBadge}>
                  <View style={styles.connectedDot} />
                  <Text style={styles.connectedText}>Connected</Text>
                </View>
              </View>

              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
                  Address
                </Text>
                <Text style={[styles.addressText, isDark && styles.textDark]}>
                  {getShortAddress(publicKey)}
                </Text>
              </View>

              <Pressable
                style={styles.dangerButton}
                onPress={handleDisconnectWallet}
              >
                <Text style={styles.dangerButtonText}>Disconnect Wallet</Text>
              </Pressable>
            </>
          ) : (
            <View style={styles.notConnected}>
              <Text style={[styles.notConnectedText, isDark && styles.subtitleDark]}>
                No wallet connected
              </Text>
              <Text style={[styles.notConnectedHint, isDark && styles.subtitleDark]}>
                Connect a wallet from the Earnings tab to receive payments
              </Text>
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, isDark && styles.subtitleDark]}>
          PREFERENCES
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={[styles.settingLabel, isDark && styles.textDark]}>
                Push Notifications
              </Text>
              <Text style={[styles.settingDesc, isDark && styles.subtitleDark]}>
                Get notified about new jobs and earnings
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={setNotificationsEnabled}
              trackColor={{ false: '#e5e7eb', true: '#c4b5fd' }}
              thumbColor={notificationsEnabled ? '#8b5cf6' : '#fff'}
            />
          </View>

          <View style={styles.divider} />

          <View style={styles.settingRow}>
            <View style={styles.settingLeft}>
              <Text style={[styles.settingLabel, isDark && styles.textDark]}>
                Auto-Accept Jobs
              </Text>
              <Text style={[styles.settingDesc, isDark && styles.subtitleDark]}>
                Automatically accept matching jobs (coming soon)
              </Text>
            </View>
            <Switch
              value={autoAcceptJobs}
              onValueChange={setAutoAcceptJobs}
              trackColor={{ false: '#e5e7eb', true: '#c4b5fd' }}
              thumbColor={autoAcceptJobs ? '#8b5cf6' : '#fff'}
              disabled
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, isDark && styles.subtitleDark]}>
          DATA
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <Pressable style={styles.dangerButton} onPress={handleResetAgent}>
            <Text style={styles.dangerButtonText}>Reset Agent & Data</Text>
          </Pressable>
          <Text style={[styles.dangerHint, isDark && styles.subtitleDark]}>
            This will delete all local data and restart onboarding. Your on-chain
            reputation is permanent.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, isDark && styles.subtitleDark]}>
          ABOUT
        </Text>
        <View style={[styles.card, isDark && styles.cardDark]}>
          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
              Version
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              {APP_VERSION}
            </Text>
          </View>

          <View style={styles.infoRow}>
            <Text style={[styles.infoLabel, isDark && styles.subtitleDark]}>
              Network
            </Text>
            <Text style={[styles.infoValue, isDark && styles.textDark]}>
              Devnet
            </Text>
          </View>

          <View style={styles.divider} />

          <Pressable style={styles.linkRow}>
            <Text style={[styles.linkText, isDark && styles.textDark]}>
              Terms of Service
            </Text>
          </Pressable>

          <Pressable style={styles.linkRow}>
            <Text style={[styles.linkText, isDark && styles.textDark]}>
              Privacy Policy
            </Text>
          </Pressable>

          <Pressable style={styles.linkRow}>
            <Text style={[styles.linkText, isDark && styles.textDark]}>
              View on GitHub
            </Text>
          </Pressable>
        </View>

        <View style={styles.footer}>
          <Text style={[styles.footerText, isDark && styles.subtitleDark]}>
            KEIRO by KAMIYO Protocol
          </Text>
          <Text style={[styles.footerSubtext, isDark && styles.subtitleDark]}>
            AI agents with permanent careers on OriginTrail DKG
          </Text>
        </View>
      </ScrollView>
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
  scrollView: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#000',
    marginBottom: 24,
  },
  textDark: {
    color: '#fff',
  },
  subtitleDark: {
    color: '#9ca3af',
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: '#f9fafb',
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
  },
  cardDark: {
    backgroundColor: '#111',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLeft: {
    flex: 1,
    marginRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#000',
  },
  settingDesc: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  infoLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#000',
  },
  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  connectedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  connectedText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#15803d',
  },
  addressText: {
    fontSize: 14,
    fontFamily: 'monospace',
    color: '#000',
  },
  notConnected: {
    alignItems: 'center',
    padding: 16,
  },
  notConnectedText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  notConnectedHint: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 4,
  },
  dangerButton: {
    backgroundColor: '#fee2e2',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  dangerButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#dc2626',
  },
  dangerHint: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'center',
    marginTop: 12,
  },
  linkRow: {
    paddingVertical: 12,
  },
  linkText: {
    fontSize: 14,
    color: '#000',
  },
  footer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  footerText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  footerSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 4,
  },
});
