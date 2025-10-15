# Kamiyo Brand Identity Guidelines
## Absolute Insight for Blockchain Incident Tracking

---

## Brand Essence

### Core Identity
**Kamiyo** (神代) — *"Ancient wisdom illuminating the blockchain's hidden truths"*

A blockchain exploit aggregation platform that channels omniscient awareness through modern information architecture, bringing divine-level visibility to confirmed incidents across all chains.

### Brand Pillars
1. **Absolute Insight** — See every confirmed exploit across all chains
2. **Primordial Order** — Organize chaos into actionable intelligence
3. **Illuminated Information** — Make the hidden visible
4. **Sacred Records** — Immutable chronicle of blockchain incidents

### What We Do (Clear Positioning)
- **We aggregate** confirmed exploits from 20+ verified sources
- **We organize** incidents by chain, protocol, and impact
- **We deliver** real-time alerts and historical data
- **We DO NOT** detect vulnerabilities or provide security analysis

---

## Tailwind Configuration

### tailwind.config.js
```javascript
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
    './app/**/*.{js,ts,jsx,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Primary Blacks
        'void': '#0A0A0B',
        'obsidian': '#141417',
        'shadow': '#1A1A1F',
        
        // Kamiyo Accent Colors
        'amaterasu': {
          DEFAULT: '#4fe9ea',
          50: '#e8fffe',
          100: '#c4fffc',
          200: '#8ffff9',
          300: '#4fe9ea',
          400: '#1dd4d5',
          500: '#00b8ba',
          600: '#009498',
          700: '#00757a',
          800: '#005d62',
          900: '#004d52'
        },
        'takemikazuchi': {
          DEFAULT: '#ff44f5',
          light: '#ff77f7',
          50: '#fff0fe',
          100: '#ffe0fd',
          200: '#ffc0fc',
          300: '#ff90f9',
          400: '#ff44f5',
          500: '#f000e8',
          600: '#d000c7',
          700: '#ad00a4',
          800: '#8e0086',
          900: '#76006f'
        },
        'susano': {
          DEFAULT: '#6366F1',
          50: '#EEF2FF',
          100: '#E0E7FF',
          200: '#C7D2FE',
          300: '#A5B4FC',
          400: '#818CF8',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81'
        },
        
        // Exploit Severity Colors
        'exploit-critical': '#FF0844',
        'exploit-high': '#F97316',
        'exploit-medium': '#EAB308',
        'exploit-low': '#22C55E',
        'exploit-info': '#06B6D4',
        
        // UI Colors
        'kamiyo-border': '#27272A',
        'kamiyo-border-hover': '#3F3F46',
        'kamiyo-text': {
          DEFAULT: '#FFFFFF',
          secondary: '#A1A1AA',
          muted: '#71717A'
        }
      },
      animation: {
        'divine-pulse': 'divine-pulse 2s ease-in-out infinite',
        'gradient-shift': 'gradient-shift 3s ease infinite',
        'glow': 'glow 2s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'alert-flash': 'alert-flash 1s ease-in-out 3',
      },
      keyframes: {
        'divine-pulse': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.6 },
        },
        'gradient-shift': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 217, 255, 0.5)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 217, 255, 0.8)' },
        },
        'alert-flash': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.3 },
        }
      }
    }
  }
}
```

---

## Core Components

### Homepage Hero Section
```jsx
<section className="px-6 py-20 text-center">
  <h1 className="text-5xl font-display font-bold mb-4">
    <span className="bg-divine-gradient bg-clip-text text-transparent">
      Kamiyo
    </span>
  </h1>
  <p className="text-xl text-kamiyo-text-secondary mb-8">
    Track every confirmed exploit across all blockchains in real-time
  </p>
  <p className="text-sm text-kamiyo-text-muted max-w-2xl mx-auto">
    We aggregate verified incidents from 20+ sources. 
    We don't detect vulnerabilities — we ensure you never miss a confirmed exploit.
  </p>
  <div className="flex gap-4 justify-center mt-8">
    <button className="bg-divine-gradient text-white px-6 py-3 rounded-lg 
                       font-medium hover:shadow-glow-cyan transition-all duration-200">
      Start Free Trial
    </button>
    <button className="border border-kamiyo-border text-kamiyo-text-secondary 
                       px-6 py-3 rounded-lg hover:border-kamiyo-border-hover 
                       hover:text-white transition-all duration-200">
      View Live Feed
    </button>
  </div>
</section>
```

### Navigation (Accurate Terminology)
```jsx
<nav className="p-4 space-y-1">
  <a className="flex items-center px-4 py-3 rounded-lg text-kamiyo-text-secondary 
                hover:bg-obsidian hover:text-white transition-all duration-200 group">
    <ActivityIcon className="w-5 h-5 mr-3 group-hover:text-amaterasu" />
    <span>Exploit Feed</span>
  </a>
  
  <a className="flex items-center px-4 py-3 rounded-lg text-kamiyo-text-secondary 
                hover:bg-obsidian hover:text-white transition-all duration-200 group">
    <ArchiveIcon className="w-5 h-5 mr-3 group-hover:text-amaterasu" />
    <span>Historical Data</span>
  </a>
  
  <a className="flex items-center px-4 py-3 rounded-lg text-kamiyo-text-secondary 
                hover:bg-obsidian hover:text-white transition-all duration-200 group">
    <SourceIcon className="w-5 h-5 mr-3 group-hover:text-amaterasu" />
    <span>Aggregated Sources</span>
  </a>
  
  <a className="flex items-center px-4 py-3 rounded-lg text-kamiyo-text-secondary 
                hover:bg-obsidian hover:text-white transition-all duration-200 group">
    <BellIcon className="w-5 h-5 mr-3 group-hover:text-amaterasu" />
    <span>Alert Settings</span>
  </a>
</nav>
```

### Exploit Feed Card
```jsx
<div className="bg-obsidian border border-kamiyo-border rounded-lg p-4 
                hover:border-amaterasu/50 transition-all duration-200
                animate-alert-flash"> {/* Flash animation for new exploits */}
  <div className="flex items-start justify-between">
    <div className="flex-1">
      <div className="flex items-center gap-2 mb-2">
        <span className="px-2 py-0.5 bg-exploit-critical/20 text-exploit-critical 
                       rounded text-xs font-medium border border-exploit-critical/30">
          CRITICAL
        </span>
        <span className="text-kamiyo-text-muted text-xs">5 minutes ago</span>
      </div>
      <h3 className="text-white font-semibold mb-1">Curve Finance</h3>
      <p className="text-kamiyo-text-secondary text-sm mb-2">
        Reentrancy exploit reported by BlockSec
      </p>
      <div className="flex items-center gap-4 text-xs">
        <span className="text-kamiyo-text-muted">Chain: Ethereum</span>
        <span className="text-red-400 font-semibold">Loss: $61.7M</span>
        <span className="text-kamiyo-text-muted">TX: 0x2e7d...</span>
      </div>
    </div>
    <button className="p-2 hover:bg-shadow rounded-lg transition-colors">
      <ExternalLink className="w-4 h-4 text-kamiyo-text-secondary" />
    </button>
  </div>
</div>
```

### Data Statistics Card (No Security Scoring)
```jsx
<div className="grid grid-cols-4 gap-4">
  {/* Total Tracked */}
  <div className="bg-obsidian rounded-lg p-4 border border-kamiyo-border
                  hover:border-amaterasu/50 transition-all duration-200">
    <p className="text-kamiyo-text-muted text-micro uppercase mb-2">Total Tracked</p>
    <p className="text-2xl font-bold text-white">2,847</p>
    <p className="text-xs text-kamiyo-text-secondary">Exploits aggregated</p>
  </div>
  
  {/* 24h Activity */}
  <div className="bg-obsidian rounded-lg p-4 border border-kamiyo-border
                  hover:border-amaterasu/50 transition-all duration-200">
    <p className="text-kamiyo-text-muted text-micro uppercase mb-2">24h Activity</p>
    <p className="text-2xl font-bold bg-divine-gradient bg-clip-text text-transparent">
      12
    </p>
    <p className="text-xs text-kamiyo-text-secondary">New incidents</p>
  </div>
  
  {/* Total Loss */}
  <div className="bg-obsidian rounded-lg p-4 border border-kamiyo-border
                  hover:border-amaterasu/50 transition-all duration-200">
    <p className="text-kamiyo-text-muted text-micro uppercase mb-2">2024 Total</p>
    <p className="text-2xl font-bold text-exploit-critical">$3.1B</p>
    <p className="text-xs text-kamiyo-text-secondary">Value lost</p>
  </div>
  
  {/* Sources */}
  <div className="bg-obsidian rounded-lg p-4 border border-kamiyo-border
                  hover:border-amaterasu/50 transition-all duration-200">
    <p className="text-kamiyo-text-muted text-micro uppercase mb-2">Sources</p>
    <p className="text-2xl font-bold text-amaterasu">23</p>
    <p className="text-xs text-kamiyo-text-secondary">Active feeds</p>
  </div>
</div>
```

### Footer Disclaimer
```jsx
<footer className="border-t border-kamiyo-border mt-20 py-8">
  <div className="container mx-auto px-6">
    <div className="text-center text-sm text-kamiyo-text-muted">
      <p className="mb-2">
        Kamiyo aggregates confirmed exploit information from public sources.
      </p>
      <p>
        We do not provide security analysis, vulnerability detection, or investment advice.
      </p>
    </div>
  </div>
</footer>
```

---

## Base Styles (globals.css)

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  body {
    @apply bg-void text-white font-mono antialiased;
  }
  
  ::selection {
    @apply bg-amaterasu/30 text-white;
  }
  
  /* Custom scrollbar */
  ::-webkit-scrollbar {
    @apply w-2 h-2;
  }
  
  ::-webkit-scrollbar-track {
    @apply bg-void;
  }
  
  ::-webkit-scrollbar-thumb {
    @apply bg-kamiyo-border rounded-full hover:bg-kamiyo-border-hover;
  }
}

@layer components {
  .btn-primary {
    @apply bg-divine-gradient text-white px-5 py-2.5 rounded-lg 
           font-medium hover:shadow-glow-cyan transition-all duration-200;
  }
  
  .card {
    @apply bg-obsidian border border-kamiyo-border rounded-lg p-6 
           hover:border-kamiyo-border-hover transition-all duration-200;
  }
  
  .exploit-severity-critical {
    @apply px-2 py-0.5 bg-exploit-critical/20 text-exploit-critical 
           rounded text-xs font-medium border border-exploit-critical/30;
  }
  
  .exploit-severity-high {
    @apply px-2 py-0.5 bg-exploit-high/20 text-exploit-high 
           rounded text-xs font-medium border border-exploit-high/30;
  }
  
  .exploit-severity-medium {
    @apply px-2 py-0.5 bg-exploit-medium/20 text-exploit-medium 
           rounded text-xs font-medium border border-exploit-medium/30;
  }
}
```

---

## Implementation Notes

### Key Messaging Points
1. Always clarify: "We aggregate, we don't analyze"
2. Use terms: "incidents", "exploits", "reports" not "vulnerabilities" or "threats"
3. Emphasize: Speed of information, not depth of analysis
4. Be transparent: All data comes from external sources

### Component Naming
- Use `ExploitFeed` not `ThreatDetection`
- Use `IncidentAlert` not `SecurityWarning`
- Use `DataAggregator` not `SecurityScanner`
- Use `SourceMonitor` not `ThreatIntelligence`

---

*"From primordial chaos, absolute insight brings clarity to the blockchain"*