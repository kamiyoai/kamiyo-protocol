# Visual Assets Checklist for X/Twitter Launch

## 🎨 HIGH PRIORITY (Create before launch)

### 1. Terminal Screenshots
- [ ] **Security Monitor Running**
  - Show: Colorful console output with exploit detection
  - Include: Timestamps, risk levels, protocol names
  - Format: Dark terminal, syntax highlighting
  - Tool: iTerm2 with oh-my-zsh theme
  - Text should pop (use colored logs)

- [ ] **Risk Assessment Output**
  - Show: Full risk report with visual progress bar
  - Include: Risk score 0-100, metrics, recommendation
  - Highlight: ✅ SAFE or 🛑 DO NOT PROCEED
  - Make score bar prominent

- [ ] **Portfolio Guardian Alert**
  - Show: Real-time threat detection
  - Include: Your position value, exploit details
  - Highlight: Dollar amounts in red/yellow

### 2. Discord/Slack Alert Screenshots
- [ ] **Critical Alert Example**
  - Show: Embedded Discord message
  - Fields: Protocol, Chain, Amount Lost, Risk Score
  - Use: Actual Discord embed (not mockup)
  - Make it look urgent (red color)

- [ ] **Alert Timeline**
  - Show: 3-4 alerts over time
  - Demonstrate: Real-time nature
  - Include timestamps

### 3. x402scan Integration
- [ ] **KAMIYO Listing on x402scan**
  - Screenshot: x402scan.com showing KAMIYO
  - Show: Both endpoints, pricing, stats
  - Highlight: Professional listing

- [ ] **Resource Detail Page**
  - Show: Full x402 schema
  - Include: Payment info, query params
  - Make it look polished

### 4. Code Screenshots
- [ ] **Payment Flow Code**
  - Show: 10-15 lines of x402 payment handling
  - Highlight: Automatic payment, token generation
  - Use: Carbon.now.sh or similar for beautiful code screenshots
  - Theme: Dracula or Night Owl

- [ ] **Agent Configuration**
  - Show: Simple config object
  - Highlight: How easy it is
  - 5-10 lines max

### 5. Comparison Graphics
- [ ] **Cost Comparison**
  ```
  Traditional Security Tools:
  Chainalysis: $16,000/year
  BlockSec: $50,000/year
  CertiK: Enterprise only

  KAMIYO Agents:
  $0.24/day = $87.60/year

  10,000x cheaper
  ```
  - Make this visual with bars/icons
  - Use red vs green
  - Big dramatic difference

- [ ] **Speed Comparison**
  ```
  Twitter: 15-30 minutes after exploit
  Discord: 10-20 minutes
  KAMIYO Agent: Real-time (< 1 minute)
  ```
  - Timeline visual
  - Show agent as fastest

---

## 📊 MEDIUM PRIORITY (Week 1-2)

### 6. Architecture Diagrams
- [ ] **x402 Payment Flow**
  ```
  Agent → API (402) → Send USDC → Verify → Token → Access Data
  ```
  - Simple flowchart
  - Use: Excalidraw, Figma, or Mermaid
  - Clean, minimal design

- [ ] **System Architecture**
  ```
  Your Agent ←→ KAMIYO API ←→ 20+ Security Sources
         ↓
    Base L2 (USDC)
  ```
  - Show the ecosystem
  - Include logos if possible

### 7. GitHub Stats
- [ ] **Repository Card**
  - Stars, forks, issues
  - Update weekly
  - Tool: GitHub's social preview or custom

- [ ] **Contributors Graph**
  - If you get contributors
  - Shows community growth

### 8. Demo GIFs
- [ ] **Agent Startup GIF**
  - 5-10 seconds
  - Show: npm install → node agent.js → running
  - Tool: Kap (Mac), LICEcap (Windows)
  - Smooth, fast-paced

- [ ] **Alert Received GIF**
  - Show: Exploit detected → Alert sent → Notification appears
  - Real-time feel
  - 3-5 seconds

- [ ] **Risk Assessment GIF**
  - Show: Command → API call → Report generated
  - 5 seconds max

### 9. Infographics
- [ ] **"How It Works" Infographic**
  - 3-4 simple steps
  - Icons for each step
  - Easy to understand at a glance

- [ ] **Agent Feature Matrix**
  ```
  | Feature | Monitor | Risk | Guardian |
  |---------|---------|------|----------|
  | 24/7    | ✅      | ❌   | ✅       |
  | On-demand| ❌     | ✅   | ❌       |
  | Alerts  | ✅      | ❌   | ✅       |
  ```
  - Simple table
  - Visual checkmarks

---

## 🎥 VIDEO CONTENT (Week 2-3)

### 10. Demo Videos
- [ ] **5-Minute Setup Video**
  - Screen recording with voiceover
  - Show: Clone → Install → Configure → Run
  - Use: Loom or ScreenFlow
  - Upload to YouTube + Twitter

- [ ] **60-Second Explainer**
  - What is x402
  - Why KAMIYO agents matter
  - Call to action
  - For: Twitter video, TikTok, Reels

- [ ] **Live Exploit Detection**
  - If you catch a real exploit live
  - Show: Agent alerting in real-time
  - Gold content if you can get it

### 11. Short-Form Content (< 30 seconds)
- [ ] **Deploy Time-Lapse**
  - Speed up deployment to 10 seconds
  - Add music
  - Text overlay: "5 minutes → 10 seconds"

- [ ] **Before/After Split Screen**
  - Left: Manual checking (slow)
  - Right: Agent running (fast)
  - Side-by-side comparison

---

## 🎭 MEMES & FUN (Ongoing)

### 12. Meme Templates
- [ ] **Drake Meme**
  - Top: "Manually checking exploit news"
  - Bottom: "AI agent that never sleeps"

- [ ] **Brain Expansion**
  - Small: Ignoring DeFi security
  - Medium: Following security Twitter
  - Galaxy: Autonomous x402 agents

- [ ] **Two Buttons Sweating**
  - Button 1: "Sleep"
  - Button 2: "Check for exploits every hour"
  - Guy: Stressed DeFi user
  - Caption: "Or just deploy an agent"

- [ ] **Virgin vs Chad**
  - Virgin: Manual monitoring, stressed, always late
  - Chad: x402 agent, relaxed, always early

### 13. Custom Graphics
- [ ] **KAMIYO Agent Mascot**
  - Friendly robot/shield character
  - Can be used across content
  - Gives personality to the brand

- [ ] **Security Shield Icon**
  - Simple, clean logo for agents
  - Use in thumbnails
  - Consistent branding

---

## 🛠 TOOLS TO USE

### Screenshot Tools
- **Mac**: CleanShot X (best), Cmd+Shift+4
- **Windows**: ShareX, Greenshot
- **Browser**: Full Page Screen Capture extension

### Code Screenshot Tools
- **Carbon.now.sh** - Beautiful code screenshots
- **Ray.so** - Similar, with more themes
- **Chalk.ist** - Syntax highlighting

### GIF Tools
- **Mac**: Kap (free, best quality)
- **Windows**: ScreenToGif, LICEcap
- **Online**: Gifski (for conversion)

### Video Tools
- **Recording**: Loom (easy), ScreenFlow (pro)
- **Editing**: DaVinci Resolve (free), iMovie, Descript
- **Compression**: Handbrake (keep under 2.2MB for Twitter)

### Design Tools
- **Quick**: Canva (templates)
- **Pro**: Figma (custom)
- **Diagrams**: Excalidraw (simple), Mermaid (code)
- **Icons**: Heroicons, Lucide

### Thumbnail Creation
- **1200x675px** for optimal Twitter display
- Bold text, high contrast
- 20% margins from edges
- File size < 5MB

---

## 📏 TWITTER IMAGE SPECS

### Optimal Sizes
- **Single image**: 1200x675px (16:9)
- **Multiple images**: 1200x600px
- **Profile header**: 1500x500px
- **Profile pic**: 400x400px (displays at 200x200)

### Best Practices
- Dark mode friendly (light backgrounds can be harsh)
- High contrast text
- Mobile-first (50%+ views on mobile)
- Test at thumbnail size (looks good when small)

---

## ✅ PRE-LAUNCH CHECKLIST

**24 Hours Before Launch:**
- [ ] 3 terminal screenshots ready
- [ ] 1 Discord alert screenshot
- [ ] 1 cost comparison graphic
- [ ] 1 code screenshot (payment flow)
- [ ] Launch thread written and reviewed
- [ ] Visuals added to thread
- [ ] Backup tweets scheduled

**Launch Day:**
- [ ] Post main thread with visuals at 9-10 AM ET
- [ ] Pin to profile
- [ ] QT your own thread with key visual
- [ ] Respond to comments with more visuals
- [ ] Share in relevant Discord/Telegram groups

**Week 1:**
- [ ] Daily content with new visual each day
- [ ] Create 1-2 new graphics based on feedback
- [ ] Start video content
- [ ] Memes on weekends

---

## 💡 PRO TIPS

1. **Make numbers HUGE** - $12M protected, 10,000x cheaper
2. **Use emojis strategically** - 🚨 for alerts, 🛡️ for protection, 💰 for cost
3. **Before/After** - Always powerful
4. **Show, don't tell** - Screenshots > descriptions
5. **Terminal aesthetics** - Colored logs, proper formatting matters
6. **Brand consistency** - Same colors, fonts across assets
7. **Mobile test** - Check how it looks on phone before posting
8. **Alt text** - Add for accessibility (and helps with algo)

---

## 🎨 COLOR PALETTE SUGGESTION

**Primary Colors:**
- Cyan/Blue: #00D9FF (security, trust)
- Red: #FF4444 (alerts, danger)
- Green: #00FF88 (safe, good)
- Purple: #B84FFF (premium, tech)

**Background:**
- Dark: #1a1a1a (terminal background)
- Black: #000000 (true black for contrast)

**Text:**
- White: #FFFFFF (primary text)
- Gray: #888888 (secondary text)

Use these consistently across all visual assets.

---

REMEMBER: Visuals do 80% of the work on Twitter. Make them SLAP. 🚀
