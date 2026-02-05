import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore, AgentPersonality } from '../../src/stores/agent';
import { AGENT_PERSONALITIES } from '../../src/lib/constants';
import { colors, typography, spacing } from '../../src/theme';
import { TerminalHeader, TerminalDivider, Button, ScanlineOverlay } from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function CreateAgentScreen() {
  const router = useRouter();

  const [name, setName] = useState('KEIRO-7');
  const [personality, setPersonality] = useState<AgentPersonality | null>(null);

  const canContinue = name.trim().length >= 2 && personality !== null;

  const handleContinue = () => {
    if (!canContinue || !personality) return;

    useAgentStore.setState({
      agent: {
        id: `agent_${Date.now()}`,
        name: name.trim(),
        personality,
        skills: [],
        tier: 'unverified',
        creditScore: 0,
        tasksCompleted: 0,
        disputeCount: 0,
        tenureDays: 0,
        avgQuality: 0,
        isActive: false,
        createdAt: new Date().toISOString(),
      },
    });

    router.push('/onboarding/skills');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}
        >
          <View style={styles.header}>
            <TerminalHeader command="create-agent" />
            <Text style={styles.step}>[1/4]</Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.title}>name your agent</Text>
            <Text style={styles.subtitle}>
              give your AI agent an identity. this will be visible to others.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="enter agent name"
              placeholderTextColor={colors.gray500}
              value={name}
              onChangeText={setName}
              maxLength={24}
              autoFocus
            />

            <TerminalDivider label="PERSONALITY" marginVertical={spacing.lg} />
            <Text style={styles.sectionSubtitle}>
              this affects how your agent communicates and approaches tasks.
            </Text>

            <View style={styles.personalityList}>
              {(Object.keys(AGENT_PERSONALITIES) as AgentPersonality[]).map((key) => {
                const { label, description } = AGENT_PERSONALITIES[key];
                const isSelected = personality === key;

                return (
                  <Pressable
                    key={key}
                    onPress={() => setPersonality(key)}
                    style={styles.personalityRow}
                  >
                    <View style={styles.personalityPrefix}>
                      <Text style={[
                        styles.personalityArrow,
                        isSelected && styles.personalityArrowSelected,
                      ]}>
                        {isSelected ? '>' : ' '}
                      </Text>
                    </View>
                    <View style={styles.personalityContent}>
                      <View style={styles.personalityRadioRow}>
                        <Text style={[
                          styles.personalityCheckbox,
                          isSelected && styles.personalityCheckboxSelected,
                        ]}>
                          {isSelected ? '[x]' : '[ ]'}
                        </Text>
                        <Text style={[
                          styles.personalityLabel,
                          isSelected && styles.personalityLabelSelected,
                        ]}>
                          {label.toLowerCase()}
                        </Text>
                      </View>
                      <Text style={styles.personalityDesc}>
                        {'      '}{description.toLowerCase()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.footer}>
            <Button
              onPress={handleContinue}
              disabled={!canContinue}
              style={{ width: '100%' }}
            >
              Continue
            </Button>

            <Button variant="ghost" onPress={() => router.back()}>
              back
            </Button>
          </View>
        </KeyboardAvoidingView>
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
  },
  keyboardView: {
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
  input: {
    fontFamily,
    backgroundColor: colors.bg.primary,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 0,
    padding: spacing.lg,
    fontSize: typography.fontSize.lg,
    color: colors.white,
    marginBottom: spacing.md,
  },
  sectionSubtitle: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.bodyText,
    marginBottom: spacing.lg,
  },
  personalityList: {
    gap: spacing.md,
  },
  personalityRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
  },
  personalityPrefix: {
    width: 20,
    alignItems: 'center',
  },
  personalityArrow: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.gray500,
  },
  personalityArrowSelected: {
    color: colors.violet,
  },
  personalityContent: {
    flex: 1,
  },
  personalityRadioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  personalityCheckbox: {
    fontFamily,
    fontSize: typography.fontSize.base,
    color: colors.gray500,
  },
  personalityCheckboxSelected: {
    color: colors.violet,
  },
  personalityLabel: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.white,
  },
  personalityLabelSelected: {
    color: colors.violet,
  },
  personalityDesc: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    marginTop: 2,
  },
  footer: {
    paddingTop: spacing.lg,
    gap: spacing.md,
    alignItems: 'center',
  },
});
