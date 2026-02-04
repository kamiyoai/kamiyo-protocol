import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  useColorScheme,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore, AgentSkill } from '../../src/stores/agent';
import { AGENT_SKILLS } from '../../src/lib/constants';

export default function SkillsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [selectedSkills, setSelectedSkills] = useState<Set<AgentSkill>>(
    new Set()
  );
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
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()}>
          <Text style={[styles.backButton, isDark && styles.textDark]}>
            ← Back
          </Text>
        </Pressable>
        <Text style={[styles.step, isDark && styles.stepDark]}>2 of 4</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.title, isDark && styles.textDark]}>
          What can {agent?.name || 'your agent'} do?
        </Text>
        <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
          Select the skills your agent will use to complete jobs. You can add
          more later.
        </Text>

        <View style={styles.skillsGrid}>
          {(Object.keys(AGENT_SKILLS) as AgentSkill[]).map(key => {
            const { label, description } = AGENT_SKILLS[key];
            const isSelected = selectedSkills.has(key);

            return (
              <Pressable
                key={key}
                style={[
                  styles.skillCard,
                  isDark && styles.skillCardDark,
                  isSelected && styles.skillCardSelected,
                ]}
                onPress={() => toggleSkill(key)}
              >
                <View style={styles.skillHeader}>
                  <Text
                    style={[
                      styles.skillLabel,
                      isDark && styles.textDark,
                      isSelected && styles.skillLabelSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                </View>
                <Text
                  style={[styles.skillDesc, isDark && styles.subtitleDark]}
                >
                  {description}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.hint}>
          <Text style={[styles.hintText, isDark && styles.subtitleDark]}>
            💡 More skills = more job opportunities, but also higher
            expectations. Start with what you know your agent does best.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Text style={[styles.selectedCount, isDark && styles.subtitleDark]}>
          {selectedSkills.size} skill{selectedSkills.size !== 1 ? 's' : ''}{' '}
          selected
        </Text>
        <Pressable
          style={[styles.button, !canContinue && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!canContinue}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </Pressable>
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
  skillsGrid: {
    gap: 12,
  },
  skillCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  skillCardDark: {
    backgroundColor: '#111',
  },
  skillCardSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f5f3ff',
  },
  skillHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  skillLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
  },
  skillLabelSelected: {
    color: '#8b5cf6',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: '#8b5cf6',
    borderColor: '#8b5cf6',
  },
  checkmark: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  skillDesc: {
    fontSize: 14,
    color: '#6b7280',
  },
  hint: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#fefce8',
    borderRadius: 12,
  },
  hintText: {
    fontSize: 14,
    color: '#854d0e',
    lineHeight: 20,
  },
  footer: {
    padding: 24,
    gap: 12,
  },
  selectedCount: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#8b5cf6',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
