# KAMIYO Companion - TODO

## X Smart Cashtags Integration (February 2026)

When X releases the Smart Cashtags API:

1. **Parse contract addresses from cashtag metadata**
   - More accurate than ticker symbol matching
   - Avoids collisions (multiple tokens with same ticker)

2. **Replace/augment DexScreener lookup**
   - Use X's native asset identification
   - Fallback to DexScreener for tokens not in X's system

3. **Trading integration (if available)**
   - Hook into X's buy/sell features
   - Could enable direct trading from bot replies

4. **Real-time price embeds**
   - Use X's native price display format
   - Match the platform's UI patterns

Monitor: https://x.com announcements for API docs
