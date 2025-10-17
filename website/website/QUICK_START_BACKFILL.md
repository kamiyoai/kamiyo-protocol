# Quick Start: Database Backfill

## Step 1: Update DATABASE_URL

The backfill script is ready but needs the correct Render database credentials.

### Get Correct DATABASE_URL from Render:

1. Log into https://dashboard.render.com
2. Navigate to your PostgreSQL database service
3. Click on "Connect" → "Internal Database URL" or "External Database URL"
4. Copy the full connection string (should look like):
   ```
   postgresql://kamiyo:[PASSWORD]@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai?sslmode=require
   ```

### Update .env File:

Edit `~/project/Projekter/kamiyo/website/.env`:

```bash
DATABASE_URL="postgresql://kamiyo:[CORRECT_PASSWORD]@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai?sslmode=require"
```

---

## Step 2: Run the Backfill Script

```bash
cd ~/project/Projekter/kamiyo/website
node scripts/backfill-exploits-node.mjs
```

### Expected Output:

```
==> Backfilling exploit database...
Connecting to database...
✓ Connected to database
Current exploit count: 3
✓ Inserted: Munchables ($62,000,000)
✓ Inserted: Curio ($16,000,000)
✓ Inserted: Radiant Capital ($50,000,000)
✓ Inserted: Platypus Finance ($8,500,000)
✓ Inserted: Euler Finance ($197,000,000)
✓ Inserted: BNB Bridge ($586,000,000)
✓ Inserted: KyberSwap ($47,000,000)
✓ Inserted: Trader Joe ($2,800,000)
✓ Inserted: Velodrome Finance ($1,200,000)
✓ Inserted: Harvest Finance ($34,000,000)

==> Backfill complete!
  Inserted: 10
  Skipped (duplicates): 0
  Total exploits in database: 13

==> Exploits by chain:
  Ethereum: 5 exploits ($309,000,000)
  BSC: 2 exploits ($636,000,000)
  Arbitrum: 1 exploits ($8,500,000)
  Polygon: 1 exploits ($47,000,000)
  Avalanche: 1 exploits ($2,800,000)
  Optimism: 1 exploits ($1,200,000)

✓ Database connection closed

✅ Backfill completed successfully
```

---

## Step 3: Verify the Data

### Check Homepage Stats:
Visit: http://localhost:3001

Should show:
- **Total Exploits Tracked**: 13 (or 10 + existing)
- **Total Value Lost**: $1,006,000,000 (or more)
- **Chains Tracked**: 6+ (Ethereum, BSC, Arbitrum, Polygon, Avalanche, Optimism)

### Check Dashboard:
Visit: http://localhost:3001/dashboard

Should show:
- 10 new real exploits with proper dates
- No more "Invalid Date" issues
- Proper chain names
- Dollar amounts formatted correctly

### Check API:
```bash
curl http://localhost:3001/api/exploits
```

Should return JSON array with 13+ exploits.

---

## Troubleshooting

### Error: "password authentication failed"
- Update DATABASE_URL with correct password from Render
- Make sure you're using the correct database (kamiyo_ai)

### Error: "relation 'exploits' does not exist"
Run the schema initialization first:
```bash
# If using psql (if installed):
psql $DATABASE_URL -f database/init_postgres.sql

# OR using Node.js:
node -e "require('dotenv').config(); const {Client}=require('pg'); const client=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}}); client.connect().then(()=>client.query(require('fs').readFileSync('database/init_postgres.sql','utf8'))).then(()=>{console.log('✓ Schema initialized'); client.end();})"
```

### Error: "pg module not found"
Install pg:
```bash
npm install pg dotenv
```

### Error: "Invalid Date" still showing
The issue was that the code was accessing `exploit.date` but the field is called `timestamp` in some parts of the codebase. This was fixed in:
- `pages/dashboard.js:126`
- `api/main.py:226`

If still seeing issues, check which field name your API is using.

---

## What's Next?

After successful backfill:

### Priority 0 (Critical - This Week):
1. **Implement Basic Scrapers**:
   ```bash
   # Create scrapers for:
   - Rekt News RSS feed
   - PeckShield Twitter API
   - BlockSec alerts
   ```

2. **Set Up Cron Job**:
   ```bash
   # In render.yaml or crontab
   */10 * * * * cd /path/to/website && node scrapers/run-all.js
   ```

3. **Test Alert System**:
   ```bash
   # Should trigger Discord/Telegram/Email alerts for new exploits
   ```

### Priority 1 (High - This Month):
1. **Decide on Beta Features**: Remove or upgrade fork-analysis and pattern-clustering
2. **Add More Historical Data**: Target 100-200 exploits
3. **Test Rate Limiting**: With different API keys and tiers
4. **Commit Honest Messaging**: Review and commit changes to pages/index.js

---

## Files Involved

### Backfill Scripts (choose one):
- **✅ RECOMMENDED**: `scripts/backfill-exploits-node.mjs` (uses pg)
- `scripts/backfill-exploits.py` (requires psycopg2)
- `scripts/backfill-exploits.mjs` (requires Prisma model)
- `scripts/backfill-exploits-pg.sql` (pure SQL)

### Database Schema:
- `database/init_postgres.sql` - PostgreSQL schema with exploits table

### Configuration:
- `.env` - DATABASE_URL and other environment variables
- `.env.example` - Template for environment variables

### Analysis Documents:
- `GAP_ANALYSIS.md` - Full gap analysis
- `IMPLEMENTATION_SUMMARY.md` - Detailed action plan
- `GAP_ANALYSIS_COMPLETION_SUMMARY.md` - Completion summary
- `QUICK_START_BACKFILL.md` - This file

---

## Need Help?

If you encounter issues:

1. Check that DATABASE_URL is correct (copy from Render dashboard)
2. Verify the database is PostgreSQL (not SQLite)
3. Ensure the exploits table exists (run init_postgres.sql if needed)
4. Check that pg and dotenv npm packages are installed
5. Review error messages carefully (authentication vs schema vs code errors)

---

**Ready to go!** Just update DATABASE_URL and run:
```bash
node scripts/backfill-exploits-node.mjs
```
