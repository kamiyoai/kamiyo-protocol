import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  useColorScheme,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAgentStore, AgentPersonality } from '../../src/stores/agent';
import { AGENT_PERSONALITIES } from '../../src/lib/constants';

export default function CreateAgentScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [name, setName] = useState('');
  const [personality, setPersonality] = useState<AgentPersonality | null>(null);
  const { createAgent } = useAgentStore();

  const canContinue = name.trim().length >= 2 && personality !== null;

  const handleContinue = () => {
    if (!canContinue || !personality) return;

    // Store partial agent data in temp state, will finalize after skills selection
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
    <SafeAreaView style={[styles.container, isDark && styles.containerDark]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()}>
            <Text style={[styles.backButton, isDark && styles.textDark]}>
              ← Back
            </Text>
          </Pressable>
          <Text style={[styles.step, isDark && styles.stepDark]}>1 of 4</Text>
        </View>

        <View style={styles.content}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            Name your agent
          </Text>
          <Text style={[styles.subtitle, isDark && styles.subtitleDark]}>
            Give your AI agent an identity. This will be visible to others.
          </Text>

          <TextInput
            style={[
              styles.input,
              isDark && styles.inputDark,
              isDark && styles.textDark,
            ]}
            placeholder="Enter agent name"
            placeholderTextColor={isDark ? '#6b7280' : '#9ca3af'}
            value={name}
            onChangeText={setName}
            maxLength={24}
            autoFocus
          />

          <Text style={[styles.sectionTitle, isDark && styles.textDark]}>
            Choose personality
          </Text>
          <Text style={[styles.sectionSubtitle, isDark && styles.subtitleDark]}>
            This affects how your agent communicates and approaches tasks.
          </Text>

          <View style={styles.personalityGrid}>
            {(Object.keys(AGENT_PERSONALITIES) as AgentPersonality[]).map(key => {
              const { label, description } = AGENT_PERSONALITIES[key];
              const isSelected = personality === key;

              return (
                <Pressable
                  key={key}
                  style={[
                    styles.personalityCard,
                    isDark && styles.personalityCardDark,
                    isSelected && styles.personalityCardSelected,
                  ]}
                  onPress={() => setPersonality(key)}
                >
                  <Text
                    style={[
                      styles.personalityLabel,
                      isDark && styles.textDark,
                      isSelected && styles.personalityLabelSelected,
                    ]}
                  >
                    {label}
                  </Text>
                  <Text
                    style={[
                      styles.personalityDesc,
                      isDark && styles.subtitleDark,
                    ]}
                  >
                    {description}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            style={[styles.button, !canContinue && styles.buttonDisabled]}
            onPress={handleContinue}
            disabled={!canContinue}
          >
            <Text style={styles.buttonText}>Continue</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
    padding: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 32,
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
  input: {
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: '#000',
    marginBottom: 32,
  },
  inputDark: {
    backgroundColor: '#111',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  personalityGrid: {
    gap: 12,
  },
  personalityCard: {
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  personalityCardDark: {
    backgroundColor: '#111',
  },
  personalityCardSelected: {
    borderColor: '#8b5cf6',
    backgroundColor: '#f5f3ff',
  },
  personalityLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  personalityLabelSelected: {
    color: '#8b5cf6',
  },
  personalityDesc: {
    fontSize: 14,
    color: '#6b7280',
  },
  footer: {
    paddingTop: 16,
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
