# Fix OpenGraph Cache on Twitter/X

## What We Fixed

✅ Added updated OpenGraph metadata directly to `website/pages/index.js`
✅ Added cache-busting parameter to image URL (`?v=2`)
✅ Updated title: "KAMIYO - Blockchain exploit alerts within 4 minutes"
✅ Updated description: "Get verified exploit data from 20+ trusted security sources across 54 blockchain networks"

## Steps to Deploy Fix

### Step 1: Redeploy Website

If deployed on Render:
```bash
git add website/pages/index.js
git commit -m "Fix OpenGraph metadata for social sharing"
git push origin main
```

Render will automatically rebuild and deploy.

If running locally:
```bash
cd website
npm run build
npm start
```

### Step 2: Clear Twitter's Card Validator Cache

Twitter/X caches OpenGraph metadata aggressively. You MUST clear their cache:

1. Go to: https://cards-dev.twitter.com/validator
2. Enter your URL: `https://kamiyo.ai`
3. Click "Preview card"
4. This forces Twitter to fetch fresh metadata

**Alternative method (via API):**
```bash
curl -X POST "https://cards-dev.twitter.com/validator" \
  -d "url=https://kamiyo.ai"
```

### Step 3: Verify the Fix

After clearing the cache:

1. Try sharing kamiyo.ai on Twitter/X
2. The card should now show:
   - ✅ Title: "KAMIYO - Blockchain exploit alerts within 4 minutes"
   - ✅ Description: "Get verified exploit data from 20+ trusted..."
   - ✅ Updated image (not "Autonomous AI Ecosystem")

### Step 4: Wait (if still shows old data)

If you still see old data after clearing cache:
- Wait 24 hours - Twitter's CDN cache may take time to update globally
- Try posting from a different account
- Use a different URL parameter: `https://kamiyo.ai/?v=1`

## What Changed

### Before:
```html
<meta property="og:title" content="KAMIYO - Autonomous AI Ecosystem" />
<meta property="og:image" content="https://kamiyo.ai/media/old-image.png" />
```

### After:
```html
<meta property="og:title" content="KAMIYO - Blockchain exploit alerts within 4 minutes" />
<meta property="og:image" content="https://kamiyo.ai/media/opengraph.jpeg?v=2" />
<meta property="og:description" content="Get verified exploit data from 20+ trusted security sources across 54 blockchain networks. Instant alerts without manual monitoring." />
```

## Troubleshooting

**Still seeing old data?**
- Clear browser cache
- Use incognito/private window
- Check that Render deployment completed successfully
- Verify the image exists at: https://kamiyo.ai/media/opengraph.jpeg
- Try the card validator again after 1 hour

**Image not loading?**
- Check that `website/public/media/opengraph.jpeg` exists
- Verify file permissions
- Check Render build logs for static asset copying
