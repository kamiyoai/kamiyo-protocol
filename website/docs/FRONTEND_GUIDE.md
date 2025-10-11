# Kamiyo Frontend Development Guide

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Component Hierarchy](#component-hierarchy)
3. [State Management](#state-management)
4. [WebSocket Integration](#websocket-integration)
5. [Styling Conventions](#styling-conventions)
6. [Performance Optimization](#performance-optimization)
7. [Testing Guide](#testing-guide)
8. [Deployment Checklist](#deployment-checklist)

---

## Architecture Overview

The Kamiyo frontend is built with modern React using TypeScript, Vite, and a component-based architecture optimized for performance and maintainability.

### Technology Stack

- **Framework**: React 18+
- **Language**: TypeScript
- **Build Tool**: Vite
- **Routing**: React Router v6
- **State Management**: Zustand (with persistence)
- **Styling**: CSS Modules + Responsive CSS
- **Charts**: Recharts
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **WebSocket**: Native WebSocket API
- **PWA**: Vite PWA Plugin

### Directory Structure

```
frontend/
├── src/
│   ├── api/              # API client and endpoints
│   │   ├── client.ts     # Axios instance with interceptors
│   │   └── billing.ts    # Billing-specific API calls
│   ├── components/       # Reusable components
│   │   ├── common/       # Generic components (Toast, Modal, Spinner)
│   │   ├── dashboard/    # Dashboard-specific components
│   │   ├── pricing/      # Pricing page components
│   │   ├── billing/      # Billing components
│   │   └── layout/       # Layout components (Nav, Footer)
│   ├── contexts/         # React contexts
│   │   └── AuthContext.tsx
│   ├── hooks/            # Custom hooks
│   │   ├── useWebSocket.ts
│   │   └── useBilling.ts
│   ├── pages/            # Page components
│   │   ├── HomePage.tsx
│   │   ├── PricingPage.tsx
│   │   ├── DashboardPage.tsx
│   │   └── APIDocsPage.tsx
│   ├── services/         # Business logic services
│   │   └── websocket.ts
│   ├── store/            # Global state (Zustand)
│   │   └── appStore.ts
│   ├── styles/           # CSS files
│   │   └── responsive.css
│   ├── types/            # TypeScript type definitions
│   │   └── index.ts
│   ├── utils/            # Utility functions
│   ├── App.tsx           # Main app component
│   └── main.tsx          # Entry point
├── public/               # Static assets
├── index.html            # HTML template
├── vite.config.ts        # Vite configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies
```

---

## Component Hierarchy

### Page-Level Components

```
App
├── AuthProvider (Context)
├── MobileNav (Layout)
├── Routes
│   ├── HomePage
│   ├── PricingPage
│   │   ├── PricingCard (x4)
│   │   └── PricingFAQ
│   ├── DashboardPage
│   │   ├── RecentExploits
│   │   ├── UsageStats
│   │   └── QuickActions
│   ├── APIDocsPage
│   └── ...
└── ToastContainer (Global)
```

### Component Categories

#### Common Components
- **Toast**: Notification system
- **Modal**: Dialog/popup component
- **LoadingSpinner**: Loading indicator

#### Dashboard Components
- **RecentExploits**: Live exploit feed with filtering
- **UsageStats**: API usage charts and metrics
- **QuickActions**: Shortcut buttons for common actions

#### Pricing Components
- **PricingCard**: Individual tier card
- **PricingFAQ**: Accordion FAQ section

#### Layout Components
- **MobileNav**: Responsive navigation
- **ResponsiveTable**: Adaptive table component

---

## State Management

We use **Zustand** for global state management with localStorage persistence.

### Store Structure

```typescript
// /src/store/appStore.ts

interface AppState {
  // Authentication
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;

  // Notifications
  notifications: Notification[];

  // WebSocket
  websocket: WebSocketState;

  // Actions
  login: (user, token) => void;
  logout: () => void;
  addNotification: (notification) => void;
  // ...
}
```

### Usage

```typescript
// In components
import { useAuthStore, useNotifications } from '@/store/appStore';

function MyComponent() {
  const { user, isAuthenticated } = useAuthStore();
  const { addNotification } = useNotifications();

  // Use state and actions
}
```

### Persistence

Authentication state is automatically persisted to localStorage:
- `user`
- `token`
- `isAuthenticated`

---

## WebSocket Integration

Real-time exploit updates are handled via WebSocket connection.

### Server Implementation

```python
# /api/websocket_server.py

class WebSocketManager:
    - Manages active connections
    - Broadcasts exploits with filtering
    - Implements heartbeat mechanism
    - Rate limiting per tier
```

### Client Implementation

```typescript
// /src/services/websocket.ts

class WebSocketService:
    - Auto-reconnect logic
    - Message queue for offline handling
    - Heartbeat ping/pong
    - Event-driven architecture
```

### Usage in Components

```typescript
import { useWebSocketExploits } from '@/hooks/useWebSocket';

function MyComponent() {
  const newExploit = useWebSocketExploits();

  useEffect(() => {
    if (newExploit) {
      // Handle new exploit
    }
  }, [newExploit]);
}
```

### WebSocket Features

- **Automatic Reconnection**: Up to 10 attempts with exponential backoff
- **Heartbeat**: Every 60 seconds to detect stale connections
- **Filtering**: Client-side filtering by chain and amount
- **Rate Limiting**: Enforced per subscription tier

---

## Styling Conventions

### Mobile-First Approach

All CSS is written mobile-first with progressive enhancement:

```css
/* Base: Mobile (< 640px) */
.card {
  padding: 1rem;
}

/* Tablet (640px+) */
@media (min-width: 640px) {
  .card {
    padding: 1.5rem;
  }
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  .card {
    padding: 2rem;
  }
}
```

### Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px
- **Desktop**: > 1024px

### Touch Targets

All interactive elements meet WCAG 2.1 AA guidelines:
- Minimum touch target: **44px x 44px**
- Spacing between targets: **8px**

### CSS Variables

```css
:root {
  --color-primary: #3b82f6;
  --spacing-4: 1rem;
  --touch-target-min: 44px;
  /* ... */
}
```

---

## Performance Optimization

### Code Splitting

Pages are lazy-loaded using `React.lazy()`:

```typescript
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
```

### Bundle Optimization

Vite configuration splits vendor code into separate chunks:

```typescript
// vite.config.ts
manualChunks: {
  'react-vendor': ['react', 'react-dom', 'react-router-dom'],
  'chart-vendor': ['recharts'],
  'stripe-vendor': ['@stripe/stripe-js'],
}
```

### Image Optimization

- Use WebP format with PNG/JPG fallback
- Lazy loading with Intersection Observer
- Responsive images with `srcset`

### Caching Strategy

#### Service Worker (PWA)

- **Static Assets**: Cache-first strategy
- **API Calls**: Network-first with fallback
- **Offline Page**: Cached offline.html

#### HTTP Caching

API responses include cache headers:
```
Cache-Control: public, max-age=300
ETag: "abc123"
```

### Performance Metrics

Target metrics (Lighthouse):
- **Performance**: > 90
- **Accessibility**: > 95
- **Best Practices**: > 90
- **SEO**: > 90
- **First Contentful Paint**: < 1.5s
- **Time to Interactive**: < 3.5s

---

## Testing Guide

### Unit Tests

Located in `src/__tests__/`:

```bash
npm run test          # Run all tests
npm run test:ui       # Open Vitest UI
npm run test:coverage # Generate coverage report
```

### Lighthouse Testing

```bash
# Start dev server
npm run dev

# In another terminal, run Lighthouse tests
npm run lighthouse
```

This tests:
- Homepage
- Pricing page
- API Docs page
- Dashboard (requires authentication)

### Manual Testing Checklist

#### Responsive Design
- [ ] Test on mobile (< 640px)
- [ ] Test on tablet (640-1024px)
- [ ] Test on desktop (> 1024px)
- [ ] Test touch interactions
- [ ] Test keyboard navigation

#### Accessibility
- [ ] Screen reader compatibility
- [ ] Keyboard-only navigation
- [ ] Color contrast (WCAG AA)
- [ ] Focus indicators
- [ ] ARIA labels

#### WebSocket
- [ ] Connect successfully
- [ ] Receive real-time updates
- [ ] Auto-reconnect on disconnect
- [ ] Heartbeat working
- [ ] Filtering works

#### Performance
- [ ] Page load < 3s on 3G
- [ ] No layout shifts (CLS < 0.1)
- [ ] Smooth animations (60fps)
- [ ] No memory leaks

---

## Deployment Checklist

### Pre-Deployment

- [ ] Run all tests: `npm run test`
- [ ] Run Lighthouse: `npm run lighthouse`
- [ ] Build production: `npm run build`
- [ ] Check bundle size: `npm run analyze`
- [ ] Test production build: `npm run preview`
- [ ] Verify environment variables
- [ ] Check console for errors/warnings

### Environment Variables

Create `.env.production`:

```env
VITE_API_URL=https://api.kamiyo.io
VITE_WS_URL=wss://api.kamiyo.io/ws
VITE_STRIPE_PUBLIC_KEY=pk_live_...
```

### Build Configuration

```bash
# Production build
npm run build

# Output in /dist directory
# - Static assets with content hashing
# - Minified JS/CSS
# - Source maps
# - PWA manifest and service worker
```

### CDN Configuration

Upload to CDN with proper headers:

```
Cache-Control: public, max-age=31536000, immutable  # For hashed assets
Cache-Control: public, max-age=0, must-revalidate   # For index.html
```

### Monitoring

Post-deployment monitoring:
- [ ] Check Sentry for errors
- [ ] Monitor Core Web Vitals
- [ ] Check WebSocket connections
- [ ] Monitor API response times
- [ ] Check service worker registration

---

## Best Practices

### Component Design

1. **Single Responsibility**: Each component does one thing well
2. **Composition**: Build complex UIs from simple components
3. **Props over State**: Pass data down, emit events up
4. **Type Safety**: Use TypeScript for all components

### State Management

1. **Local First**: Use `useState` for local component state
2. **Global When Needed**: Use Zustand for shared state
3. **No Prop Drilling**: Use context or global state
4. **Derive Don't Store**: Compute derived values

### Performance

1. **Lazy Load**: Split code by route
2. **Memoize**: Use `React.memo` for expensive components
3. **Virtualize**: Use virtual scrolling for long lists
4. **Debounce**: Debounce search/filter inputs

### Accessibility

1. **Semantic HTML**: Use proper HTML elements
2. **ARIA Labels**: Add labels where needed
3. **Keyboard Nav**: Support Tab, Enter, Escape
4. **Focus Management**: Handle focus in modals/drawers

---

## Troubleshooting

### WebSocket Not Connecting

1. Check if API server is running
2. Verify WebSocket endpoint URL
3. Check browser console for errors
4. Ensure token is valid (for authenticated routes)

### Build Failures

1. Clear node_modules: `rm -rf node_modules && npm install`
2. Clear Vite cache: `rm -rf node_modules/.vite`
3. Check for TypeScript errors: `npm run tsc --noEmit`

### Slow Performance

1. Run Lighthouse audit
2. Check bundle size: `npm run analyze`
3. Verify service worker is active
4. Check for memory leaks in Chrome DevTools

---

## Additional Resources

- [React Documentation](https://react.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/)
- [Vite Guide](https://vitejs.dev/guide/)
- [Web.dev Performance](https://web.dev/performance/)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Last Updated**: 2024-01-15
**Version**: 1.0.0
**Maintainer**: Kamiyo Team
