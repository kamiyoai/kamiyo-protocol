"""
Liquidation Pattern Analyzer
Detects suspicious liquidation patterns that may indicate exploits
"""

import logging
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import hashlib

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent))

from models.security import (
    LiquidationPattern,
    SecurityEvent,
    ThreatSeverity,
    ThreatType
)
from aggregators.base import BaseAggregator

logger = logging.getLogger(__name__)


class LiquidationAnalyzer(BaseAggregator):
    """
    Analyzes liquidation patterns to detect:
    - Flash loan attacks (large liquidations in same block)
    - Cascade liquidations (domino effect)
    - Price manipulation via liquidations
    - Coordinated whale liquidations
    """

    API_URL = "https://api.hyperliquid.xyz/info"

    # Detection thresholds
    FLASH_LOAN_WINDOW_SEC = 10         # Flash loan happens within 10 seconds
    FLASH_LOAN_MIN_USD = 500000        # Minimum $500k to be suspicious
    CASCADE_WINDOW_SEC = 300           # Cascade happens within 5 minutes
    CASCADE_MIN_LIQUIDATIONS = 5       # At least 5 liquidations
    MANIPULATION_PRICE_IMPACT = 2.0    # >2% price impact is suspicious

    def __init__(self, monitored_addresses: List[str] = None):
        """
        Initialize liquidation analyzer

        Args:
            monitored_addresses: List of wallet addresses to monitor for liquidations.
                                If None/empty, analyzer will use alternative data sources.
        """
        super().__init__("liquidation_analyzer")
        self.recent_liquidations: List[Dict[str, Any]] = []
        self.detected_patterns: List[LiquidationPattern] = []
        self.monitored_addresses = monitored_addresses or []

        # Note: Hyperliquid API doesn't provide "all liquidations" endpoint
        # Options for getting liquidation data:
        # 1. Monitor specific high-value addresses (set via monitored_addresses)
        # 2. Integrate with third-party aggregators (CoinGlass, etc)
        # 3. WebSocket subscriptions for real-time monitoring
        # 4. Historical data from GitHub repository
        self.logger.info(f"Monitoring {len(self.monitored_addresses)} addresses for liquidations")

    async def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Detect exploits via liquidation pattern analysis

        Returns:
            List of detected exploits
        """
        exploits = []

        try:
            # Fetch recent liquidations
            liquidations = await self._fetch_recent_liquidations()

            if not liquidations:
                return exploits

            # Update internal state
            self.recent_liquidations.extend(liquidations)
            self._cleanup_old_liquidations()

            # Analyze for patterns
            patterns = self._analyze_patterns(liquidations)

            # Convert suspicious patterns to exploits
            for pattern in patterns:
                if pattern.suspicion_score > 70:  # High suspicion
                    exploit = self._pattern_to_exploit(pattern)
                    exploits.append(exploit)

            self.logger.info(
                f"Liquidation Analyzer: {len(liquidations)} liquidations, "
                f"{len(patterns)} patterns, {len(exploits)} exploits"
            )

        except Exception as e:
            self.logger.error(f"Error analyzing liquidations: {e}", exc_info=True)

        return exploits

    async def _fetch_recent_liquidations(self) -> List[Dict[str, Any]]:
        """
        Fetch recent liquidations from monitored addresses

        Note: Hyperliquid API limitation - there's no "all liquidations" endpoint.
        This implementation fetches fills for monitored addresses and identifies liquidations.

        Returns:
            List of liquidation dictionaries
        """
        liquidations = []

        if not self.monitored_addresses:
            # No addresses to monitor
            self.logger.debug("No monitored addresses configured for liquidation tracking")
            return liquidations

        for address in self.monitored_addresses:
            try:
                # Fetch user fills
                payload = {
                    "type": "userFills",
                    "user": address
                }

                response = await self.make_request(
                    self.API_URL,
                    method='POST',
                    json=payload,
                    headers={'Content-Type': 'application/json'}
                )

                if not response:
                    continue

                fills = response.json()

                # Parse fills to identify liquidations
                # Liquidations are typically marked by specific fill types or large losses
                for fill in fills:
                    if self._is_liquidation_fill(fill):
                        liquidation = self._parse_liquidation(fill, address)
                        if liquidation:
                            liquidations.append(liquidation)

            except Exception as e:
                self.logger.error(f"Error fetching liquidations for {address}: {e}")
                continue

        return liquidations

    def _is_liquidation_fill(self, fill: Dict[str, Any]) -> bool:
        """
        Determine if a fill represents a liquidation

        Args:
            fill: Fill data from API

        Returns:
            True if fill is a liquidation
        """
        # Liquidations typically have:
        # - Large position closures
        # - Negative PnL
        # - Specific direction patterns ("Close Long", "Close Short")

        try:
            direction = fill.get('dir', '')
            closed_pnl = float(fill.get('closedPnl', 0))
            size = abs(float(fill.get('sz', 0)))

            # Heuristics for liquidation:
            # 1. Position is being closed
            # 2. Significant size
            # 3. Negative PnL (losing position)
            is_close = 'Close' in direction
            is_large = size > 0.1  # Adjust threshold as needed
            is_loss = closed_pnl < 0

            # Additional check: liquidations often happen near mark price
            # and may have specific fee structures

            return is_close and is_large and is_loss

        except Exception as e:
            self.logger.error(f"Error checking if fill is liquidation: {e}")
            return False

    def _parse_liquidation(self, fill: Dict[str, Any], user: str) -> Optional[Dict[str, Any]]:
        """
        Parse fill data into liquidation format

        Args:
            fill: Fill data from API
            user: User address

        Returns:
            Liquidation dictionary or None
        """
        try:
            # Extract relevant fields
            timestamp_ms = fill.get('time', 0)
            timestamp = datetime.fromtimestamp(timestamp_ms / 1000) if timestamp_ms else datetime.now(timezone.utc)

            return {
                'liquidation_id': f"liq-{fill.get('oid', 'unknown')}",
                'user': user,
                'asset': fill.get('coin', 'UNKNOWN'),
                'side': 'LONG' if 'Long' in fill.get('dir', '') else 'SHORT',
                'size': abs(float(fill.get('sz', 0))),
                'liquidation_price': float(fill.get('px', 0)),
                'amount_usd': abs(float(fill.get('closedPnl', 0))),  # Using closed PnL as approximation
                'timestamp': timestamp,
                'source': 'hyperliquid_api',
                'metadata': {
                    'fill_id': fill.get('oid'),
                    'direction': fill.get('dir'),
                    'closed_pnl': float(fill.get('closedPnl', 0))
                }
            }

        except Exception as e:
            self.logger.error(f"Error parsing liquidation: {e}")
            return None

    def _cleanup_old_liquidations(self):
        """Remove liquidations older than 1 hour"""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)

        self.recent_liquidations = [
            liq for liq in self.recent_liquidations
            if liq.get('timestamp', datetime.min) > cutoff
        ]

    def _analyze_patterns(self, new_liquidations: List[Dict[str, Any]]) -> List[LiquidationPattern]:
        """
        Analyze liquidations for suspicious patterns

        Args:
            new_liquidations: Newly fetched liquidations

        Returns:
            List of detected patterns
        """
        patterns = []

        # Check for flash loan attacks
        flash_loan_patterns = self._detect_flash_loan_attacks(new_liquidations)
        patterns.extend(flash_loan_patterns)

        # Check for cascade liquidations
        cascade_patterns = self._detect_cascades(self.recent_liquidations)
        patterns.extend(cascade_patterns)

        # Check for coordinated attacks
        coordinated_patterns = self._detect_coordinated_attacks(self.recent_liquidations)
        patterns.extend(coordinated_patterns)

        self.detected_patterns.extend(patterns)

        return patterns

    def _detect_flash_loan_attacks(
        self,
        liquidations: List[Dict[str, Any]]
    ) -> List[LiquidationPattern]:
        """
        Detect potential flash loan attacks

        Flash loan characteristics:
        - Large liquidation(s) in very short time window
        - Often same block or within seconds
        - Unusual price impact
        """
        patterns = []

        # Group liquidations by time window
        time_buckets = self._group_by_time_window(liquidations, self.FLASH_LOAN_WINDOW_SEC)

        for timestamp, bucket_liquidations in time_buckets.items():
            total_usd = sum(liq.get('amount_usd', 0) for liq in bucket_liquidations)

            # Check if meets flash loan criteria
            if total_usd >= self.FLASH_LOAN_MIN_USD and len(bucket_liquidations) >= 1:
                pattern = self._create_flash_loan_pattern(timestamp, bucket_liquidations)
                patterns.append(pattern)

        return patterns

    def _detect_cascades(
        self,
        liquidations: List[Dict[str, Any]]
    ) -> List[LiquidationPattern]:
        """
        Detect liquidation cascades (domino effect)

        Cascade characteristics:
        - Multiple liquidations in same asset
        - Progressively lower prices
        - Within short time window (5 min)
        """
        patterns = []

        # Group by asset
        by_asset = defaultdict(list)
        for liq in liquidations:
            asset = liq.get('asset')
            if asset:
                by_asset[asset].append(liq)

        # Analyze each asset for cascades
        for asset, asset_liquidations in by_asset.items():
            if len(asset_liquidations) < self.CASCADE_MIN_LIQUIDATIONS:
                continue

            # Sort by timestamp
            sorted_liqs = sorted(
                asset_liquidations,
                key=lambda x: x.get('timestamp', datetime.min)
            )

            # Check if prices are falling progressively
            is_cascade = self._is_cascade_pattern(sorted_liqs)

            if is_cascade:
                pattern = self._create_cascade_pattern(asset, sorted_liqs)
                patterns.append(pattern)

        return patterns

    def _detect_coordinated_attacks(
        self,
        liquidations: List[Dict[str, Any]]
    ) -> List[LiquidationPattern]:
        """
        Detect coordinated liquidation attacks

        Characteristics:
        - Multiple large liquidations
        - Same users or related addresses
        - Unusual timing patterns
        """
        patterns = []

        # Group by user
        by_user = defaultdict(list)
        for liq in liquidations:
            user = liq.get('user')
            if user:
                by_user[user].append(liq)

        # Look for users with multiple large liquidations
        for user, user_liquidations in by_user.items():
            if len(user_liquidations) >= 3:
                total_usd = sum(liq.get('amount_usd', 0) for liq in user_liquidations)

                if total_usd >= 1000000:  # $1M+ in total
                    pattern = self._create_coordinated_pattern(user, user_liquidations)
                    patterns.append(pattern)

        return patterns

    def _group_by_time_window(
        self,
        liquidations: List[Dict[str, Any]],
        window_seconds: float
    ) -> Dict[datetime, List[Dict[str, Any]]]:
        """Group liquidations by time windows"""
        buckets = defaultdict(list)

        for liq in liquidations:
            timestamp = liq.get('timestamp', datetime.now(timezone.utc))

            # Round to window
            window_key = datetime.fromtimestamp(
                (timestamp.timestamp() // window_seconds) * window_seconds
            )

            buckets[window_key].append(liq)

        return buckets

    def _is_cascade_pattern(self, sorted_liquidations: List[Dict[str, Any]]) -> bool:
        """
        Check if liquidations show cascade pattern

        Args:
            sorted_liquidations: Liquidations sorted by timestamp

        Returns:
            True if cascade pattern detected
        """
        if len(sorted_liquidations) < self.CASCADE_MIN_LIQUIDATIONS:
            return False

        # Check time window
        first_time = sorted_liquidations[0].get('timestamp', datetime.min)
        last_time = sorted_liquidations[-1].get('timestamp', datetime.now(timezone.utc))

        time_diff = (last_time - first_time).total_seconds()
        if time_diff > self.CASCADE_WINDOW_SEC:
            return False

        # Check if prices are generally declining
        prices = [liq.get('liquidation_price', 0) for liq in sorted_liquidations]

        declining_count = 0
        for i in range(1, len(prices)):
            if prices[i] < prices[i-1]:
                declining_count += 1

        # At least 70% should be declining
        return declining_count / (len(prices) - 1) >= 0.7

    def _create_flash_loan_pattern(
        self,
        timestamp: datetime,
        liquidations: List[Dict[str, Any]]
    ) -> LiquidationPattern:
        """Create pattern object for flash loan attack"""
        liquidation_ids = [liq.get('liquidation_id', '') for liq in liquidations]
        total_usd = sum(liq.get('amount_usd', 0) for liq in liquidations)
        users = set(liq.get('user') for liq in liquidations if liq.get('user'))
        assets = list(set(liq.get('asset') for liq in liquidations if liq.get('asset')))

        # Calculate price impact per asset
        price_impact = {}
        asset_liquidations = defaultdict(list)
        for liq in liquidations:
            asset = liq.get('asset')
            if asset:
                asset_liquidations[asset].append(liq)

        for asset, asset_liqs in asset_liquidations.items():
            if len(asset_liqs) >= 2:
                # Calculate price movement if we have multiple liquidations
                prices = [liq.get('liquidation_price', 0) for liq in asset_liqs]
                min_price = min(prices)
                max_price = max(prices)
                if min_price > 0:
                    impact_pct = ((max_price - min_price) / min_price) * 100
                    price_impact[asset] = impact_pct
            else:
                # Single liquidation - estimate impact based on size
                # Large liquidations typically have ~0.5-2% market impact
                size_usd = asset_liqs[0].get('amount_usd', 0)
                if size_usd > 1000000:
                    price_impact[asset] = 1.5  # Estimate for large liquidation
                elif size_usd > 500000:
                    price_impact[asset] = 1.0
                else:
                    price_impact[asset] = 0.5

        # Calculate suspicion score
        suspicion_score = self._calculate_flash_loan_suspicion(liquidations, total_usd)

        # Identify suspicious indicators
        indicators = []
        if total_usd > 2000000:
            indicators.append(f"Very large amount: ${total_usd:,.0f}")
        if len(liquidations) == 1:
            indicators.append("Single large liquidation in short window")
        if len(assets) > 3:
            indicators.append(f"Multiple assets affected: {len(assets)}")

        pattern_id = self._generate_pattern_id("flash_loan", timestamp)

        return LiquidationPattern(
            pattern_id=pattern_id,
            timestamp=timestamp,
            pattern_type="flash_loan",
            liquidation_ids=liquidation_ids,
            total_liquidated_usd=total_usd,
            affected_users=len(users),
            duration_seconds=self.FLASH_LOAN_WINDOW_SEC,
            assets_involved=assets,
            price_impact=price_impact,
            suspicion_score=suspicion_score,
            indicators=indicators,
            is_cross_block=len(liquidations) > 1
        )

    def _create_cascade_pattern(
        self,
        asset: str,
        liquidations: List[Dict[str, Any]]
    ) -> LiquidationPattern:
        """Create pattern object for cascade liquidation"""
        liquidation_ids = [liq.get('liquidation_id', '') for liq in liquidations]
        total_usd = sum(liq.get('amount_usd', 0) for liq in liquidations)
        users = set(liq.get('user') for liq in liquidations if liq.get('user'))

        first_time = liquidations[0].get('timestamp', datetime.now(timezone.utc))
        last_time = liquidations[-1].get('timestamp', datetime.now(timezone.utc))
        duration = (last_time - first_time).total_seconds()

        # Calculate price impact
        first_price = liquidations[0].get('liquidation_price', 0)
        last_price = liquidations[-1].get('liquidation_price', 1)
        price_change_pct = ((last_price - first_price) / first_price * 100) if first_price > 0 else 0

        suspicion_score = self._calculate_cascade_suspicion(
            len(liquidations),
            total_usd,
            abs(price_change_pct)
        )

        indicators = [
            f"{len(liquidations)} liquidations in {duration:.0f} seconds",
            f"Price moved {abs(price_change_pct):.2f}%",
            f"Total liquidated: ${total_usd:,.0f}"
        ]

        pattern_id = self._generate_pattern_id("cascade", first_time)

        return LiquidationPattern(
            pattern_id=pattern_id,
            timestamp=first_time,
            pattern_type="cascade",
            liquidation_ids=liquidation_ids,
            total_liquidated_usd=total_usd,
            affected_users=len(users),
            duration_seconds=duration,
            assets_involved=[asset],
            price_impact={asset: price_change_pct},
            suspicion_score=suspicion_score,
            indicators=indicators,
            is_cross_block=True
        )

    def _create_coordinated_pattern(
        self,
        user: str,
        liquidations: List[Dict[str, Any]]
    ) -> LiquidationPattern:
        """Create pattern object for coordinated attack"""
        liquidation_ids = [liq.get('liquidation_id', '') for liq in liquidations]
        total_usd = sum(liq.get('amount_usd', 0) for liq in liquidations)
        assets = list(set(liq.get('asset') for liq in liquidations if liq.get('asset')))

        first_time = min(liq.get('timestamp', datetime.now(timezone.utc)) for liq in liquidations)
        last_time = max(liq.get('timestamp', datetime.now(timezone.utc)) for liq in liquidations)
        duration = (last_time - first_time).total_seconds()

        suspicion_score = self._calculate_coordinated_suspicion(len(liquidations), total_usd)

        indicators = [
            f"Same user liquidated {len(liquidations)} times",
            f"Total loss: ${total_usd:,.0f}",
            f"Across {len(assets)} assets"
        ]

        pattern_id = self._generate_pattern_id("coordinated", first_time)

        return LiquidationPattern(
            pattern_id=pattern_id,
            timestamp=first_time,
            pattern_type="coordinated",
            liquidation_ids=liquidation_ids,
            total_liquidated_usd=total_usd,
            affected_users=1,
            duration_seconds=duration,
            assets_involved=assets,
            price_impact={},
            suspicion_score=suspicion_score,
            indicators=indicators,
            is_cross_block=True
        )

    def _calculate_flash_loan_suspicion(
        self,
        liquidations: List[Dict[str, Any]],
        total_usd: float
    ) -> float:
        """Calculate suspicion score for flash loan pattern (0-100)"""
        score = 0.0

        # Amount component (0-50 points)
        if total_usd > 5000000:
            score += 50
        elif total_usd > 2000000:
            score += 40
        elif total_usd > 1000000:
            score += 30
        else:
            score += (total_usd / self.FLASH_LOAN_MIN_USD) * 20

        # Single vs multiple liquidations (0-30 points)
        if len(liquidations) == 1 and total_usd > 2000000:
            score += 30  # Single huge liquidation is very suspicious

        # Speed component (0-20 points)
        score += 20  # Already within flash loan window

        return min(100, score)

    def _calculate_cascade_suspicion(
        self,
        count: int,
        total_usd: float,
        price_impact_pct: float
    ) -> float:
        """Calculate suspicion score for cascade pattern (0-100)"""
        score = 0.0

        # Count component (0-30 points)
        score += min(30, (count / 10) * 30)

        # Amount component (0-40 points)
        score += min(40, (total_usd / 5000000) * 40)

        # Price impact component (0-30 points)
        if price_impact_pct > 5.0:
            score += 30
        else:
            score += (price_impact_pct / 5.0) * 30

        return min(100, score)

    def _calculate_coordinated_suspicion(self, count: int, total_usd: float) -> float:
        """Calculate suspicion score for coordinated pattern (0-100)"""
        score = 0.0

        # Count component (0-50 points)
        score += min(50, (count / 5) * 50)

        # Amount component (0-50 points)
        score += min(50, (total_usd / 3000000) * 50)

        return min(100, score)

    def _pattern_to_exploit(self, pattern: LiquidationPattern) -> Dict[str, Any]:
        """Convert liquidation pattern to exploit format"""
        return {
            'tx_hash': pattern.pattern_id,
            'chain': 'Hyperliquid',
            'protocol': 'Hyperliquid DEX',
            'amount_usd': pattern.total_liquidated_usd,
            'timestamp': pattern.timestamp,
            'source': self.name,
            'source_url': 'https://app.hyperliquid.xyz',
            'category': f'liquidation_{pattern.pattern_type}',
            'description': (
                f"Suspicious {pattern.pattern_type} liquidation pattern detected: "
                f"{len(pattern.liquidation_ids)} liquidations totaling "
                f"${pattern.total_liquidated_usd:,.0f}. "
                f"Indicators: {', '.join(pattern.indicators)}"
            ),
            'recovery_status': 'investigating'
        }

    def _generate_pattern_id(self, pattern_type: str, timestamp: datetime) -> str:
        """Generate unique pattern ID"""
        data = f"{pattern_type}_{timestamp.isoformat()}"
        return f"liq-{pattern_type[:3]}-" + hashlib.sha256(data.encode()).hexdigest()[:12]
