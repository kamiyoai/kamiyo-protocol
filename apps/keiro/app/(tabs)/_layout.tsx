import { Tabs } from 'expo-router';
import { Text, StyleSheet, Platform } from 'react-native';
import { colors, typography } from '../../src/theme';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

const TAB_CONFIG: Record<string, { key: string; label: string }> = {
  index: { key: 'H', label: 'OME' },
  jobs: { key: 'J', label: 'OBS' },
  earnings: { key: 'E', label: 'ARN' },
  reputation: { key: 'R', label: 'EP' },
  settings: { key: 'S', label: 'ET' },
};

function HotkeyLabel({ name, focused }: { name: string; focused: boolean }) {
  const config = TAB_CONFIG[name];
  if (!config) return null;

  return (
    <Text style={styles.tabLabel}>
      <Text style={focused ? styles.bracketActive : styles.bracketDim}>[</Text>
      <Text style={focused ? styles.keyActive : styles.keyDim}>{config.key}</Text>
      <Text style={focused ? styles.bracketActive : styles.bracketDim}>]</Text>
      <Text style={focused ? styles.labelActive : styles.labelDim}>{config.label}</Text>
    </Text>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.violet,
        tabBarInactiveTintColor: colors.gray500,
        tabBarStyle: {
          backgroundColor: '#000000',
          borderTopColor: '#1F2937',
          borderTopWidth: 1,
          height: 70,
          paddingTop: 12,
          paddingBottom: 16,
        },
        tabBarLabelStyle: {
          fontFamily,
          fontSize: typography.fontSize.xs,
        },
        tabBarIconStyle: {
          display: 'none',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: () => null,
          tabBarLabel: ({ focused }) => (
            <HotkeyLabel name="index" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: () => null,
          tabBarLabel: ({ focused }) => (
            <HotkeyLabel name="jobs" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="earnings"
        options={{
          title: 'Earnings',
          tabBarIcon: () => null,
          tabBarLabel: ({ focused }) => (
            <HotkeyLabel name="earnings" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="reputation"
        options={{
          title: 'Reputation',
          tabBarIcon: () => null,
          tabBarLabel: ({ focused }) => (
            <HotkeyLabel name="reputation" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: () => null,
          tabBarLabel: ({ focused }) => (
            <HotkeyLabel name="settings" focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontFamily,
    fontSize: typography.fontSize.xs,
    letterSpacing: typography.letterSpacing.wide,
  },
  bracketActive: {
    fontFamily,
    color: colors.gray400,
  },
  bracketDim: {
    fontFamily,
    color: colors.gray500,
  },
  keyActive: {
    fontFamily: fontFamilyBold,
    color: colors.violet,
  },
  keyDim: {
    fontFamily,
    color: colors.gray500,
  },
  labelActive: {
    fontFamily,
    color: colors.white,
  },
  labelDim: {
    fontFamily,
    color: colors.gray500,
  },
});
