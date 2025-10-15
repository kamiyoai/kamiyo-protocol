# Quick Start - Get Everything Working in 15 Minutes

## The Problem
Your autonomous growth engine needs `https://api.kamiyo.ai/exploits` to work, but it's not deployed yet.

## Two Paths

### Path A: Test NOW with Mock API (5 minutes) ⚡
### Path B: Deploy Real API (15 minutes) 🚀

---

## PATH A: Test NOW (5 minutes)

### Step 1: Start Mock API
```bash
cd ~/project/Projekter/kamiyo
python3 mock_api_server.py
```

### Step 2: Get Discord Webhook (2 minutes)
1. Discord server → Settings → Integrations → Webhooks
2. New Webhook → Copy URL

### Step 3: Run Social Engine
```bash
export KAMIYO_API_URL=http://localhost:8000
export DISCORD_SOCIAL_ENABLED=true
export DISCORD_SOCIAL_WEBHOOKS="exploit-alerts=YOUR_DISCORD_WEBHOOK_URL"
python3 social/autonomous_growth_engine.py --mode poll
```

---

## PATH B: Deploy Real API (15 minutes)

### Step 1: Deploy to Render
1. Go to https://dashboard.render.com
2. New → Blueprint
3. Connect GitHub repo
4. Select branch: main
5. Apply (uses render.yaml)

### Step 2: Configure DNS
In your domain registrar, add:
```
Type: CNAME
Name: api
Value: kamiyo-api.onrender.com
```

### Step 3: Test
```bash
curl https://api.kamiyo.ai/health
```

### Step 4: Run Social Engine
```bash
export KAMIYO_API_URL=https://api.kamiyo.ai
export DISCORD_SOCIAL_ENABLED=true
export DISCORD_SOCIAL_WEBHOOKS="exploit-alerts=YOUR_WEBHOOK"
python3 social/autonomous_growth_engine.py --mode poll
```

---

See API_DEPLOYMENT_GUIDE.md for detailed instructions.
