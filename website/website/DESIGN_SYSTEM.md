# Kamiyo Design System - 神代

## Overview
Production-grade design system for the Kamiyo exploit intelligence platform, featuring divine Japanese aesthetics with modern glassmorphism and fluid animations.

## Color Palette

### Primary - Divine Colors
- **Amaterasu (天照)** - Cyan `#00D9FF` - Primary brand color, light, divine awareness
- **Susano (須佐之男)** - Indigo `#6366F1` - Secondary, storm energy
- **Takemikazuchi (建御雷)** - Purple `#7C3AED` - Accent, divine thunder

### Backgrounds
- **Void** `#0A0A0B` - Primary background
- **Obsidian** `#141417` - Card backgrounds
- **Shadow** `#1A1A1F` - Elevated surfaces

### Exploit Severity
- **Critical** `#EF4444` - Red
- **High** `#F97316` - Orange
- **Medium** `#EAB308` - Yellow
- **Low** `#22C55E` - Green
- **Info** `#06B6D4` - Cyan

## Typography
- **Font Family**: Monospace (ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas)
- **Headings**: Bold (700), tight letter-spacing (-0.02em)
- **Body**: Regular line-height (1.6), antialiased

## Components

### Buttons
- **Primary**: Gradient from amaterasu to susano, scales on hover, shadow glow
- **Secondary**: Obsidian background, border animations on hover
- **Ghost**: Transparent with border reveal on hover

### Cards
- **Standard**: Gradient from obsidian via shadow, border glow on hover
- **Interactive**: Lifts on hover (-translate-y-1), enhanced shadow, cursor pointer

### Badges
- Severity-specific colors with opacity backgrounds
- Uppercase tracking-wider text
- Border with transparency

### Forms
- **Input**: Obsidian background, border transitions, focus ring with amaterasu glow
- **Search**: Enhanced with icon states, keyboard shortcuts (⌘K), animated clear button

## Animations

### Keyframes
- `divine-pulse` - Opacity pulse for emphasis (2s)
- `gradient-shift` - Background position animation (3s)
- `glow` - Box shadow intensity pulse (2s)
- `float` - Vertical translation for floating effect (6s)
- `fade-in-up` - Opacity + translateY entrance
- `shimmer` - Shine effect for loading states

### Utilities
- Animation delays (100ms-500ms)
- Smooth transitions with cubic-bezier easing
- Backdrop blur effects (backdrop-divine)

## Effects

### Glassmorphism
- Backdrop blur with semi-transparent obsidian backgrounds
- Border gradients using divine colors
- Layered shadows for depth

### Glow Effects
- **Cyan Glow**: `0 0 30px rgba(0, 217, 255, 0.3)`
- **Purple Glow**: `0 0 30px rgba(124, 58, 237, 0.3)`
- **Critical Glow**: `0 0 30px rgba(239, 68, 68, 0.5)`
- **Text Glow**: Cyan and purple variants

### Gradients
- **Divine Gradient**: `linear-gradient(135deg, #00D9FF, #6366F1, #7C3AED)`
- **Exploit Gradient**: `linear-gradient(135deg, #EF4444, #F97316, #EAB308)`
- Text gradients with bg-clip-text

## Advanced Components

### StatsWidget
- **AnimatedNumber**: Smooth counter animations with easing
- **Sparkline**: SVG path generation for trend visualization
- **DonutChart**: Circular progress with gradient strokes
- **TrendIndicator**: Arrow with percentage change

### ExploitFeed
- Card-based layout with severity indicators
- Loading skeletons with staggered animation delays
- Empty states with divine iconography
- Hover effects with scale and glow

### SearchBar
- Keyboard shortcut integration (⌘K focus)
- Focus state with scale transform and glow
- Dynamic button states (clear vs search)
- Animated bottom border on focus

### ChainFilter
- Grid layout (2 columns)
- Selection states with check icons
- Incident counts per chain
- Gradient backgrounds for active states

## Accessibility
- Focus-visible ring with amaterasu color
- Keyboard navigation support
- Semantic HTML structure
- Proper ARIA labels
- Color contrast ratios meet WCAG AA standards

## Responsive Design
- Mobile-first approach
- Grid breakpoints at sm/md/lg/xl
- Touch-friendly tap targets (min 44px)
- Fluid typography scaling

## Performance
- CSS animations use transform/opacity for GPU acceleration
- Lazy loading for heavy components
- Debounced search inputs
- Optimized re-renders with React.memo where applicable

## Divine Philosophy
The design embodies 神代 (Kamiyo) - "Age of the Gods":
- **Light**: Amaterasu cyan represents divine awareness and illumination
- **Storm**: Susano indigo represents power and dynamic energy
- **Thunder**: Takemikazuchi purple represents swift, decisive action
- **Void**: Deep blacks represent the infinite potential

Every interaction should feel purposeful, divine, and powerful - befitting a platform that watches over the blockchain realm.
