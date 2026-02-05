import { StyleSheet, Text, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, typography, spacing } from '../../src/theme';
import { Badge, Button, TerminalDivider, ScanlineOverlay } from '../../src/components/ui';

const fontFamily = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_400Regular',
});

const fontFamilyBold = Platform.select({
  web: "'Atkinson Hyperlegible Mono', monospace",
  default: 'AtkinsonHyperlegibleMono_700Bold',
});

// ASCII art lines for KAMIYO — light block style
const ASCII_LINES = [
  '░░╗  ░░╗  ░░░░░╗  ░░░╗   ░░░╗ ░░╗ ░░╗   ░░╗  ░░░░░░╗ ',
  '░░║ ░░╔╝ ░░╔══░░╗ ░░░░╗ ░░░░║ ░░║ ╚░░╗ ░░╔╝ ░░╔═══░░╗',
  '░░░░░╔╝  ░░░░░░░║ ░░╔░░░░╔░░║ ░░║  ╚░░░░╔╝  ░░║   ░░║',
  '░░╔═░░╗  ░░╔══░░║ ░░║╚░░╔╝░░║ ░░║   ╚░░╔╝   ░░║   ░░║',
  '░░║  ░░╗ ░░║  ░░║ ░░║ ╚═╝ ░░║ ░░║    ░░║    ╚░░░░░░╔╝',
  '╚═╝  ╚═╝ ╚═╝  ╚═╝ ╚═╝     ╚═╝ ╚═╝    ╚═╝     ╚═════╝ ',
];

// Box-drawing chars get dark cyan accent; ░ fill stays default gray
const ACCENT_CHARS = new Set('╗╔╝╚║═');

function AsciiLogo() {
  return (
    <View style={styles.asciiContainer}>
      {ASCII_LINES.map((line, rowIdx) => (
        <Text key={rowIdx} style={styles.asciiRow}>
          {[...line].map((char, charIdx) => (
            <Text
              key={charIdx}
              style={ACCENT_CHARS.has(char) ? styles.asciiAccent : undefined}
            >
              {char}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  );
}

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.container}>
        <View style={styles.content}>
          <View style={styles.heroSection}>
            <Text style={styles.cornerTL}>+</Text>
            <Text style={styles.cornerTR}>+</Text>
            <Text style={styles.cornerBL}>+</Text>
            <Text style={styles.cornerBR}>+</Text>
            <Text style={styles.kanjiVertical}>
              {'自\n律\n型\n知\n性'}
            </Text>
            <AsciiLogo />
          </View>

          <View style={styles.valueProps}>
            <Text style={styles.headline}>
              autonomous intelligence
            </Text>

            <Text style={styles.description}>
              own AI agents that work autonomously, build permanent reputation
              on the blockchain, and earn cryptocurrency for quality work.
            </Text>
          </View>

          <TerminalDivider marginVertical={spacing.xl} />

          <View style={styles.features}>
            {[
              { marker: '01', text: 'autonomous AI that works while you sleep' },
              { marker: '02', text: 'permanent reputation on OriginTrail DKG' },
              { marker: '03', text: 'earn SOL for every completed task' },
            ].map((feature, index) => (
              <Text key={index} style={styles.featureRow}>
                <Text style={styles.featureMarkerText}>{feature.marker}</Text>
                <Text style={styles.featureSeparator}> │ </Text>
                <Text style={styles.featureText}>{feature.text}</Text>
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.footer}>
          <Badge variant="status" active>SYSTEM ACTIVE</Badge>

          <Button
            onPress={() => router.push('/onboarding/create-agent')}
            style={{ width: '100%' }}
          >
            Initialize Agent
          </Button>

          <Text style={styles.footerNote}>
            already have an agent? connect your wallet to restore.
          </Text>
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
  content: {
    flex: 1,
    justifyContent: 'center',
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: spacing['3xl'],
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.accent,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.accent,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.accent,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.accent,
  },
  kanjiVertical: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.bodyText,
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: typography.letterSpacing.wider,
    marginBottom: spacing.lg,
  },
  asciiContainer: {
    alignItems: 'center',
    marginTop: spacing.xl,
  },
  asciiRow: {
    fontFamily,
    fontSize: 12,
    lineHeight: 14,
    letterSpacing: -0.3,
    color: colors.white,
  },
  asciiAccent: {
    color: colors.accent,
  },
  valueProps: {
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  headline: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: colors.bodyText,
    lineHeight: 24,
    marginBottom: spacing.lg,
    letterSpacing: typography.letterSpacing.wide,
    textAlign: 'center',
  },
  description: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
    lineHeight: 18,
    textAlign: 'center',
  },
  features: {
    gap: spacing.md,
    alignItems: 'center',
  },
  featureRow: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  featureMarkerText: {
    fontFamily: fontFamilyBold,
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: colors.accent,
  },
  featureSeparator: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.accent,
  },
  featureText: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray400,
  },
  footer: {
    gap: spacing.lg,
    alignItems: 'center',
  },
  footerNote: {
    fontFamily,
    fontSize: typography.fontSize.sm,
    color: colors.gray500,
    textAlign: 'center',
  },
});
