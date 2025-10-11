# Kamiyo - Quick Start Guide

## What is Kamiyo?

Kamiyo aggregates confirmed cryptocurrency exploits from external sources (DeFiLlama, Rekt News, etc.) and provides:
- **Real-time aggregation** from 20+ sources
- **REST API** with filtering and pagination
- **Web dashboard** for visualization
- **Historical database** of 400+ exploits

**We aggregate information. We do NOT scan code or detect vulnerabilities.**

---

## Prerequisites

- Python 3.8+
- pip3
- Basic command line knowledge

---

## Installation

###1. Clone repository:
```bash
cd ~/Projekter
git clone <your-repo-url> exploit-intel-platform
cd exploit-intel-platform
```

### 2. Install dependencies:
```bash
pip3 install -r requirements.txt
```

Or install manually:
```bash
pip3 install feedparser python-dateutil requests pyyaml \
             fastapi uvicorn pydantic httpx schedule
```

---

## Running Kamiyo

### Option 1: Run Everything (Recommended)
```bash
python3 main.py all
```

This starts:
- **API** on http://localhost:8000
- **Dashboard** on http://localhost:3000
- **Aggregator** (fetches every 5 minutes)

### Option 2: Run Components Separately

**Start API only:**
```bash
python3 main.py api
```

**Start Aggregator only:**
```bash
python3 main.py aggregator
```

**Start Frontend only:**
```bash
python3 main.py frontend
```

### Option 3: Quick Test
```bash
python3 main.py test
```
Runs one aggregation cycle and shows results.

---

## Accessing Kamiyo

Once running:

1. **Dashboard**: http://localhost:3000
   - View recent exploits
   - Filter by chain, amount, protocol
   - See statistics

2. **API Documentation**: http://localhost:8000/docs
   - Interactive API documentation
   - Try endpoints directly

3. **API Endpoints**:
   - `GET /exploits` - List exploits with filters
   - `GET /exploits/{tx_hash}` - Single exploit
   - `GET /stats?days=7` - Statistics
   - `GET /chains` - List of chains
   - `GET /health` - System health

---

## Example API Calls

### Get recent exploits:
```bash
curl "http://localhost:8000/exploits?page=1&page_size=10"
```

### Filter by chain:
```bash
curl "http://localhost:8000/exploits?chain=Ethereum&page_size=5"
```

### Get exploits over $1M:
```bash
curl "http://localhost:8000/exploits?min_amount=1000000"
```

### Get 7-day statistics:
```bash
curl "http://localhost:8000/stats?days=7"
```

---

## Project Structure

```
exploit-intel-platform/
├── database/           # SQLite database layer
├── aggregators/        # Source aggregators (DeFiLlama, Rekt News)
├── api/                # FastAPI REST API
├── frontend/           # HTML dashboard
├── config/             # Configuration files
├── data/               # SQLite database file
└── main.py             # Main entry point
```

---

## Current Status

✅ **Working:**
- 415+ exploits in database
- 54 blockchains tracked
- DeFiLlama aggregator (416 exploits)
- Full REST API
- Web dashboard
- Health monitoring

⏳ **Pending:**
- Additional sources (BlockSec, PeckShield, etc.)
- Real-time alerts (Discord, Telegram, Email)
- Subscription system
- Docker deployment

---

## Troubleshooting

### "Module not found" errors:
```bash
pip3 install -r requirements.txt
```

### Database errors:
```bash
rm data/kamiyo.db
python3 test_database.py
```

### API not responding:
```bash
# Check if port 8000 is in use
lsof -i :8000
# Kill any existing process
kill -9 <PID>
```

### Frontend not loading data:
1. Ensure API is running on http://localhost:8000
2. Open browser console for errors
3. Check CORS is enabled in API

---

## Development

### Run tests:
```bash
# Database tests
python3 test_database.py

# API tests
python3 test_api.py

# Aggregator test
python3 aggregators/orchestrator.py
```

### Add new aggregator:
1. Create `aggregators/your_source.py`
2. Inherit from `BaseAggregator`
3. Implement `fetch_exploits()`
4. Add to `orchestrator.py`

---

## What Kamiyo Does NOT Do

❌ Scan smart contracts for vulnerabilities
❌ Detect or predict future exploits
❌ Provide security audits or consulting
❌ Score protocol "safety" or "risk"
❌ Analyze code quality

**We only aggregate confirmed, publicly reported exploits from external sources.**

For vulnerability detection, consult security firms like:
- Trail of Bits
- OpenZeppelin
- CertiK
- Consensys Diligence

---

## Support

- **Documentation**: See `PROGRESS.md` for detailed implementation
- **Issues**: Create GitHub issue
- **Questions**: Check `CLAUDE.md` for project guidelines

---

## License

MIT License - Free and open source

---

**Built with transparency. Focused on speed. Honest about capabilities.**
