"""
GitHub Historical Data Aggregator
Fetches historical exploit data from hyperliquid-dex/historical_data repository
Focus: Extract anomalous events and potential exploits from historical liquidations
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
import csv
import io
from .base import BaseAggregator


class GitHubHistoricalAggregator(BaseAggregator):
    """Aggregator for Hyperliquid's GitHub historical data - identifies exploits from liquidation patterns"""

    BASE_URL = "https://raw.githubusercontent.com/hyperliquid-dex/historical_data/main"

    def __init__(self):
        super().__init__("github_historical")

    async def fetch_exploits(self, date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch potential exploits from historical liquidation data

        Args:
            date: Date in YYYY-MM-DD format. If None, analyzes all available data

        Returns:
            List of exploits detected from anomalous liquidation patterns
        """
        exploits = []

        try:
            # Fetch liquidations.csv
            csv_url = f"{self.BASE_URL}/liquidations.csv"
            response = await self.make_request(csv_url)

            if not response:
                return exploits

            # Parse CSV and identify anomalous patterns
            csv_data = csv.DictReader(io.StringIO(response.text))
            liquidations_by_user = {}

            for row in csv_data:
                # Skip if date filter is specified and doesn't match
                if date and not row.get('time', '').startswith(date):
                    continue

                user = row.get('user', '')
                amount = float(row.get('amount', 0))

                if user not in liquidations_by_user:
                    liquidations_by_user[user] = []

                liquidations_by_user[user].append({
                    'amount': amount,
                    'time': row.get('time', ''),
                    'asset': row.get('asset', ''),
                    'row': row
                })

            # Identify users with multiple large liquidations (potential exploit victims)
            for user, user_liq in liquidations_by_user.items():
                total_liquidated = sum(liq['amount'] for liq in user_liq)

                # Flag as potential exploit if total liquidations > $500k
                if total_liquidated > 500_000 or len(user_liq) > 10:
                    exploit_data = self._create_exploit_from_liquidations(user, user_liq)
                    if exploit_data:
                        normalized = self.normalize_exploit(exploit_data)
                        if self.validate_exploit(normalized):
                            exploits.append(normalized)

            self.logger.info(f"Identified {len(exploits)} potential exploits from historical data")

        except Exception as e:
            self.logger.error(f"Error fetching historical exploits: {e}")

        return exploits

    def _create_exploit_from_liquidations(
        self,
        user: str,
        liquidations: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Create exploit record from liquidation pattern

        Args:
            user: User address
            liquidations: List of liquidation events for this user

        Returns:
            Exploit data dictionary
        """
        total_amount = sum(liq['amount'] for liq in liquidations)
        earliest = min(liquidations, key=lambda x: x['time'])
        latest = max(liquidations, key=lambda x: x['time'])

        # Get most common asset
        asset_counts = {}
        for liq in liquidations:
            asset = liq['asset']
            asset_counts[asset] = asset_counts.get(asset, 0) + 1

        most_common_asset = max(asset_counts, key=asset_counts.get) if asset_counts else 'Unknown'

        return {
            'tx_hash': self.generate_tx_hash(user, earliest['time'], total_amount),
            'chain': 'Hyperliquid',
            'protocol': 'Hyperliquid DEX',
            'amount_usd': total_amount,
            'timestamp': self.parse_date(latest['time']) or datetime.now(timezone.utc),
            'source_url': f"{self.BASE_URL}/liquidations.csv",
            'category': 'mass_liquidation',
            'description': f"User {user[:10]}... experienced {len(liquidations)} liquidations totaling ${total_amount:,.2f} on {most_common_asset}",
            'recovery_status': 'unknown'
        }

    async def get_trades(self, date: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch historical trades data

        Args:
            date: Date in YYYY-MM-DD format

        Returns:
            List of trades
        """
        trades = []

        try:
            csv_url = f"{self.BASE_URL}/trades.csv"
            response = await self.make_request(csv_url)

            if not response:
                return trades

            csv_data = csv.DictReader(io.StringIO(response.text))

            for row in csv_data:
                if date and not row.get('time', '').startswith(date):
                    continue

                trades.append(dict(row))

        except Exception as e:
            self.logger.error(f"Error fetching historical trades: {e}")

        return trades
