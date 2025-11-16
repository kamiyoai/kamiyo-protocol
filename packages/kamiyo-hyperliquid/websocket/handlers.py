"""
WebSocket Message Handlers
Process real-time data from Hyperliquid WebSocket and trigger alerts
"""

import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from decimal import Decimal

logger = logging.getLogger(__name__)


class WebSocketHandlers:
    """
    Message handlers for Hyperliquid WebSocket data

    Integrates with:
    - Alert system for real-time notifications
    - Database for persistence
    - Monitors for analysis
    """

    def __init__(
        self,
        alert_manager=None,
        oracle_monitor=None,
        liquidation_analyzer=None,
        hlp_monitor=None
    ):
        """
        Initialize handlers with monitoring components

        Args:
            alert_manager: HyperliquidAlertManager instance
            oracle_monitor: OracleMonitor instance
            liquidation_analyzer: LiquidationAnalyzer instance
            hlp_monitor: HLPVaultMonitor instance
        """
        self.alert_manager = alert_manager
        self.oracle_monitor = oracle_monitor
        self.liquidation_analyzer = liquidation_analyzer
        self.hlp_monitor = hlp_monitor

        # Track previous prices for deviation detection
        self.previous_prices: Dict[str, float] = {}

        # Track liquidation patterns
        self.recent_liquidations = []

        logger.info("WebSocket handlers initialized")

    async def handle_all_mids(self, data: Dict[str, Any]):
        """
        Handle allMids subscription (all mid prices)

        Used for real-time oracle deviation detection

        Message format:
        {
            "channel": "allMids",
            "data": {
                "mids": {
                    "BTC": "43250.0",
                    "ETH": "2250.5",
                    ...
                }
            }
        }
        """
        try:
            mids = data.get('data', {}).get('mids', {})

            if not mids:
                return

            logger.debug(f"Received {len(mids)} mid prices")

            # Check for oracle deviations
            if self.oracle_monitor:
                await self._check_oracle_deviations(mids)

        except Exception as e:
            logger.error(f"Error handling allMids: {e}")

    async def _check_oracle_deviations(self, mids: Dict[str, str]):
        """
        Check for oracle price deviations

        Args:
            mids: Dictionary of asset -> price
        """
        try:
            # Get external prices (Binance, Coinbase)
            external_prices = {}

            # For each asset, compare Hyperliquid price to external sources
            for asset, hl_price_str in mids.items():
                try:
                    hl_price = float(hl_price_str)

                    # Get external price (would use oracle_monitor here)
                    # For now, check if deviation from previous price is significant
                    if asset in self.previous_prices:
                        prev_price = self.previous_prices[asset]
                        deviation_pct = abs(hl_price - prev_price) / prev_price * 100

                        # Alert on >0.5% sudden price change
                        if deviation_pct > 0.5 and self.alert_manager:
                            logger.warning(
                                f"Sudden price change for {asset}: "
                                f"{deviation_pct:.2f}% ({prev_price} -> {hl_price})"
                            )

                            # Only alert on very large sudden moves (likely oracle issue)
                            if deviation_pct > 1.0:
                                self.alert_manager.alert_oracle_deviation(
                                    asset=asset,
                                    deviation_pct=deviation_pct,
                                    hl_price=hl_price,
                                    reference_price=prev_price,
                                    duration=1  # Real-time, so 1 second
                                )

                    # Update previous price
                    self.previous_prices[asset] = hl_price

                except (ValueError, TypeError) as e:
                    logger.debug(f"Error parsing price for {asset}: {e}")
                    continue

        except Exception as e:
            logger.error(f"Error checking oracle deviations: {e}")

    async def handle_trades(self, data: Dict[str, Any]):
        """
        Handle trades subscription

        Used for detecting unusual trading patterns

        Message format:
        {
            "channel": "trades",
            "data": [
                {
                    "coin": "BTC",
                    "side": "B",
                    "px": "43250.0",
                    "sz": "1.5",
                    "time": 1699000000000,
                    "hash": "0x..."
                }
            ]
        }
        """
        try:
            trades = data.get('data', [])

            if not trades:
                return

            logger.debug(f"Received {len(trades)} trades")

            # Detect large trades
            for trade in trades:
                await self._analyze_trade(trade)

        except Exception as e:
            logger.error(f"Error handling trades: {e}")

    async def _analyze_trade(self, trade: Dict[str, Any]):
        """
        Analyze individual trade for suspicious patterns

        Args:
            trade: Trade data
        """
        try:
            coin = trade.get('coin', '')
            px = float(trade.get('px', 0))
            sz = float(trade.get('sz', 0))
            side = trade.get('side', '')

            trade_usd = px * abs(sz)

            # Alert on very large trades (>$1M)
            if trade_usd > 1_000_000 and self.alert_manager:
                logger.info(
                    f"Large trade detected: {coin} ${trade_usd:,.0f} "
                    f"({side}, {sz} @ {px})"
                )

                # Check if this could be part of flash loan attack
                # (multiple large trades in quick succession)
                # This would require more sophisticated analysis

        except (ValueError, TypeError, KeyError) as e:
            logger.debug(f"Error analyzing trade: {e}")

    async def handle_user_fills(self, data: Dict[str, Any]):
        """
        Handle userFills subscription

        Used for monitoring HLP vault and specific addresses

        Message format:
        {
            "channel": "userFills",
            "data": {
                "isSnapshot": false,
                "user": "0x...",
                "fills": [
                    {
                        "coin": "BTC",
                        "px": "43250.0",
                        "sz": "1.5",
                        "side": "B",
                        "time": 1699000000000,
                        "startPosition": "0.0",
                        "dir": "Open Long",
                        "closedPnl": "0.0",
                        "hash": "0x...",
                        "tid": 12345,
                        "fee": "10.0",
                        "liquidation": false
                    }
                ]
            }
        }
        """
        try:
            user = data.get('data', {}).get('user', '')
            fills = data.get('data', {}).get('fills', [])
            is_snapshot = data.get('data', {}).get('isSnapshot', False)

            if not fills:
                return

            if is_snapshot:
                logger.debug(f"Received snapshot of {len(fills)} fills for {user}")
            else:
                logger.debug(f"Received {len(fills)} new fills for {user}")

            # Process fills
            for fill in fills:
                await self._process_fill(user, fill)

        except Exception as e:
            logger.error(f"Error handling userFills: {e}")

    async def _process_fill(self, user: str, fill: Dict[str, Any]):
        """
        Process individual fill/trade

        Args:
            user: User address
            fill: Fill data
        """
        try:
            is_liquidation = fill.get('liquidation', False) or 'Liquidat' in fill.get('dir', '')

            if is_liquidation:
                await self._process_liquidation(user, fill)
            else:
                # Regular fill - check for unusual patterns
                coin = fill.get('coin', '')
                px = float(fill.get('px', 0))
                sz = float(fill.get('sz', 0))
                closed_pnl = float(fill.get('closedPnl', 0))

                fill_usd = px * abs(sz)

                # Log significant fills
                if fill_usd > 100_000:
                    logger.info(
                        f"Large fill for {user[:10]}...: "
                        f"{coin} ${fill_usd:,.0f} PnL: ${closed_pnl:,.0f}"
                    )

        except Exception as e:
            logger.error(f"Error processing fill: {e}")

    async def _process_liquidation(self, user: str, fill: Dict[str, Any]):
        """
        Process liquidation event

        Args:
            user: User address
            fill: Liquidation data
        """
        try:
            coin = fill.get('coin', '')
            px = float(fill.get('px', 0))
            sz = float(fill.get('sz', 0))
            time_ms = fill.get('time', 0)

            liquidation_usd = px * abs(sz)

            logger.warning(
                f"Liquidation detected: {user[:10]}... "
                f"{coin} ${liquidation_usd:,.0f}"
            )

            # Track for pattern detection
            self.recent_liquidations.append({
                'user': user,
                'coin': coin,
                'amount_usd': liquidation_usd,
                'timestamp': datetime.fromtimestamp(time_ms / 1000, tz=timezone.utc),
                'price': px,
                'size': sz
            })

            # Keep only last 100 liquidations in memory
            if len(self.recent_liquidations) > 100:
                self.recent_liquidations = self.recent_liquidations[-100:]

            # Check for cascade liquidations
            await self._check_cascade_liquidations()

            # Alert on large liquidations (>$500k)
            if liquidation_usd > 500_000 and self.alert_manager:
                # Check if this is flash loan attack pattern
                recent_window = self._get_recent_liquidations_window(seconds=10)

                if len(recent_window) >= 2:
                    total_usd = sum(liq['amount_usd'] for liq in recent_window)

                    if total_usd > 500_000:
                        # Potential flash loan attack
                        assets = list(set(liq['coin'] for liq in recent_window))

                        self.alert_manager.alert_flash_loan_attack(
                            total_usd=total_usd,
                            duration=10,
                            liquidation_count=len(recent_window),
                            assets=assets
                        )

        except Exception as e:
            logger.error(f"Error processing liquidation: {e}")

    def _get_recent_liquidations_window(self, seconds: int) -> list:
        """
        Get liquidations within recent time window

        Args:
            seconds: Time window in seconds

        Returns:
            List of recent liquidations
        """
        cutoff = datetime.now(timezone.utc)
        cutoff = cutoff.replace(second=cutoff.second - seconds)

        return [
            liq for liq in self.recent_liquidations
            if liq['timestamp'] >= cutoff
        ]

    async def _check_cascade_liquidations(self):
        """Check for cascade liquidation pattern"""
        try:
            # Check last 5 minutes
            recent = self._get_recent_liquidations_window(seconds=300)

            if len(recent) >= 5:  # 5+ liquidations in 5 minutes
                total_usd = sum(liq['amount_usd'] for liq in recent)

                if total_usd > 100_000 and self.alert_manager:
                    logger.warning(
                        f"Cascade liquidation detected: "
                        f"{len(recent)} liquidations, ${total_usd:,.0f}"
                    )

                    # Calculate price impact
                    coins = {}
                    for liq in recent:
                        coin = liq['coin']
                        if coin not in coins:
                            coins[coin] = []
                        coins[coin].append(liq['price'])

                    price_impact = {}
                    for coin, prices in coins.items():
                        if len(prices) >= 2:
                            max_price = max(prices)
                            min_price = min(prices)
                            impact = abs(max_price - min_price) / min_price * 100
                            price_impact[coin] = impact

                    self.alert_manager.alert_cascade_liquidation(
                        total_usd=total_usd,
                        count=len(recent),
                        duration=300,
                        price_impact=price_impact
                    )

        except Exception as e:
            logger.error(f"Error checking cascade liquidations: {e}")

    async def handle_l2_book(self, data: Dict[str, Any]):
        """
        Handle l2Book subscription (order book data)

        Used for detecting order book manipulation

        Message format:
        {
            "channel": "l2Book",
            "data": {
                "coin": "BTC",
                "time": 1699000000000,
                "levels": [
                    [
                        {"px": "43250.0", "sz": "1.5", "n": 3},
                        {"px": "43240.0", "sz": "2.0", "n": 5}
                    ],
                    [
                        {"px": "43260.0", "sz": "1.0", "n": 2},
                        {"px": "43270.0", "sz": "3.5", "n": 7}
                    ]
                ]
            }
        }
        """
        try:
            coin = data.get('data', {}).get('coin', '')
            levels = data.get('data', {}).get('levels', [[], []])

            if len(levels) < 2:
                return

            bids = levels[0]  # Buy orders
            asks = levels[1]  # Sell orders

            logger.debug(
                f"Order book update for {coin}: "
                f"{len(bids)} bids, {len(asks)} asks"
            )

            # Analyze order book for manipulation
            # (Large orders, spoofing, etc.)
            # This would require more sophisticated analysis

        except Exception as e:
            logger.error(f"Error handling l2Book: {e}")

    async def handle_user_fundings(self, data: Dict[str, Any]):
        """
        Handle userFundings subscription

        Used for detecting funding rate manipulation

        Message format:
        {
            "channel": "userFundings",
            "data": {
                "isSnapshot": false,
                "user": "0x...",
                "fundings": [
                    {
                        "time": 1699000000000,
                        "coin": "BTC",
                        "fundingRate": "0.0001",
                        "szi": "10.0",
                        "usdc": "-10.5"
                    }
                ]
            }
        }
        """
        try:
            user = data.get('data', {}).get('user', '')
            fundings = data.get('data', {}).get('fundings', [])

            if not fundings:
                return

            logger.debug(f"Received {len(fundings)} funding payments for {user}")

            # Analyze funding payments
            for funding in fundings:
                coin = funding.get('coin', '')
                rate = float(funding.get('fundingRate', 0))
                usdc = float(funding.get('usdc', 0))

                # Alert on extreme funding rates
                if abs(rate) > 0.01 and self.alert_manager:  # >1% funding rate
                    logger.warning(
                        f"Extreme funding rate for {coin}: "
                        f"{rate*100:.3f}% (${usdc:,.2f} paid)"
                    )

        except Exception as e:
            logger.error(f"Error handling userFundings: {e}")

    def get_stats(self) -> Dict[str, Any]:
        """Get handler statistics"""
        return {
            'tracked_prices': len(self.previous_prices),
            'recent_liquidations': len(self.recent_liquidations),
        }
