import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore, AgentSkill } from '../../src/stores/agent';
import { AGENT_SKILLS } from '../../src/lib/constants';
import { colors, typography, spacing } from '../../src/theme';
import { TerminalHeader, TerminalDivider, TerminalFrame, Button, ScanlineOverlay } from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

export default function SkillsScreen() {
  const router = useRouter();

  const [selectedSkills, setSelectedSkills] = useState<Set<AgentSkill>>(new Set());
  const { agent, updateAgent } = useAgentStore();

  const toggleSkill = (skill: AgentSkill) => {
    const newSkills = new Set(selectedSkills);
    if (newSkills.has(skill)) {
      newSkills.delete(skill);
    } else {
      newSkills.add(skill);
    }
    setSelectedSkills(newSkills);
  };

  const canContinue = selectedSkills.size >= 1;

  const handleContinue = () => {
    if (!canContinue) return;

    updateAgent({
      skills: Array.from(selectedSkills),
    });

    router.push('/onboarding/connect-wallet');
  };

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TerminalHeader command="select-skills" />
          <Text style={styles.step}>[2/4]</Text>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>
            what can {agent?.name || 'your agent'} do?
          </Text>
          <Text style={styles.subtitle}>
            select the skills your agent will use to complete jobs. you can add
            more later.
          </Text>

          <TerminalDivider label="AVAILABLE SKILLS" marginVertical={spacing.lg} />

          <View style={styles.skillsList}>
            {(Object.keys(AGENT_SKILLS) as AgentSkill[]).map((key) => {
              const { label, description } = AGENT_SKILLS[key];
              const isSelected = selectedSkills.has(key);

              return (
                <Pressable
                  key={key}
                  onPress={() => toggleSkill(key)}
                  style={styles.skillRow}
                >
                  <Text style={[
                    styles.skillCheckbox,
                    isSelected && styles.skillCheckboxSelected,
                  ]}>
                    {isSelected ? '[x]' : '[ ]'}
                  </Text>
                  <View style={styles.skillContent}>
                    <Text style={[
                      styles.skillLabel,
                      isSelected && styles.skillLabelSelected,
                    ]}>
                      {label.toUpperCase()}
                    </Text>
                    <Text style={styles.skillDesc}>
                      {description.toLowerCase()}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.hintWrapper}>
            <TerminalFrame>
              <Text style={styles.hintText}>
                more skills = more job opportunities, but also higher expectations.
                start with what you know your agent does best.
              </Text>
            </TerminalFrame>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <Text style={styles.selectedCount}>
            {selectedSkills.size} skill{selectedSkills.size !== 1 ? 's' : ''} selected
          </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing['2xl'],
    paddingBottom: 0,
  },
  step: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    color: colors.gray500,
    letterSpacing: typography.letterSpacing.wide,
  },
  content: {
    flex: 1,
    padding: spacing['2xl'],
    paddingTop: spacing.lg,
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
    marginBottom: spacing.sm,
  },
  skillsList: {
    gap: spacing.lg,
  },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  skillCheckbox: {
    fontFamily,
    fontSize: typography.fontSize.base,
    color: colors.gray500,
    marginTop: 1,
  },
  skillCheckboxSelected: {
    color: colors.violet,
  },
  skillContent: {
    flex: 1,
  },
  skillLabel: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.white,
  },
  skillLabelSelected: {
    color: colors.violet,
  },
  skillDesc: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    marginTop: 2,
  },
  hintWrapper: {
    marginTop: spacing.xl,
  },
  hintText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.bodyText,
    lineHeight: 20,
  },
  footer: {
    padding: spacing['2xl'],
    gap: spacing.md,
    alignItems: 'center',
  },
  selectedCount: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    textAlign: 'center',
  },
});
