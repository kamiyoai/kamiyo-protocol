# -*- coding: utf-8 -*-
"""
Cross-Protocol Correlation Engine - Proprietary kamiyo.ai feature
Detects coordinated attacks spanning multiple protocols

Examples:
- Flash loan attack on Aave -> exploit on GMX
- Oracle manipulation on one DEX -> cascade liquidations on others
- Bridge exploit -> multi-chain attack
"""

from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import logging

logger = logging.getLogger(__name__)


class CrossProtocolCorrelator:
    """
    Analyzes events across protocols to detect coordinated attacks
    """

    def __init__(
        self,
        correlation_window_seconds: int = 300,
        min_protocols_involved: int = 2
    ):
        """
        Initialize correlator

        Args:
            correlation_window_seconds: Time window for correlation (default 5 min)
            min_protocols_involved: Minimum protocols for correlation
        """
        self.correlation_window = timedelta(seconds=correlation_window_seconds)
        self.min_protocols = min_protocols_involved

        self.event_buffer: List[Dict[str, Any]] = []
        self.max_buffer_size = 10000

    def add_event(
        self,
        event: Dict[str, Any],
        protocol: str
    ):
        """
        Add event to correlation buffer

        Args:
            event: Security event
            protocol: Protocol identifier
        """
        enriched_event = {
            **event,
            'protocol': protocol,
            'added_at': datetime.now(timezone.utc)
        }

        self.event_buffer.append(enriched_event)

        self._cleanup_buffer()

    def detect_correlations(self) -> List[Dict[str, Any]]:
        """
        Detect correlated events across protocols

        Returns:
            List of correlation groups
        """
        if len(self.event_buffer) < self.min_protocols:
            return []

        correlations = []

        windows = self._create_time_windows()

        for window_start, window_events in windows.items():
            protocols_in_window = set(e['protocol'] for e in window_events)

            if len(protocols_in_window) >= self.min_protocols:
                correlation = self._analyze_correlation(window_events)

                if correlation:
                    correlations.append({
                        'window_start': window_start,
                        'protocols_involved': list(protocols_in_window),
                        'num_events': len(window_events),
                        'correlation_score': correlation['score'],
                        'attack_pattern': correlation['pattern'],
                        'severity': correlation['severity'],
                        'events': window_events
                    })

        return correlations

    def _create_time_windows(self) -> Dict[datetime, List[Dict]]:
        """
        Group events into time windows

        Returns:
            Dict mapping window_start -> events
        """
        windows = defaultdict(list)

        for event in self.event_buffer:
            timestamp = event.get('timestamp', event['added_at'])

            window_start = timestamp.replace(
                second=(timestamp.second // 60) * 60,
                microsecond=0
            )

            windows[window_start].append(event)

        return windows

    def _analyze_correlation(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Analyze if events are truly correlated

        Args:
            events: Events in time window

        Returns:
            Correlation analysis or None
        """
        patterns = [
            self._detect_flash_loan_cascade(events),
            self._detect_oracle_arbitrage(events),
            self._detect_bridge_exploit_chain(events),
            self._detect_liquidation_cascade(events)
        ]

        for pattern in patterns:
            if pattern:
                return pattern

        return None

    def _detect_flash_loan_cascade(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect flash loan -> exploit cascade

        Pattern:
        1. Large flash loan (Aave/dYdX)
        2. Oracle manipulation (any DEX)
        3. Exploit/liquidation (target protocol)
        """
        has_flash_loan = any(
            'flash_loan' in e.get('threat_type', '') for e in events
        )

        has_oracle_deviation = any(
            'oracle' in e.get('threat_type', '') for e in events
        )

        has_exploit = any(
            e.get('threat_type') in ['exploit', 'liquidation_cascade'] for e in events
        )

        if has_flash_loan and has_oracle_deviation and has_exploit:
            return {
                'pattern': 'flash_loan_cascade',
                'score': 0.95,
                'severity': 'critical',
                'description': 'Flash loan attack with oracle manipulation detected'
            }

        return None

    def _detect_oracle_arbitrage(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect cross-DEX oracle arbitrage attack
        """
        oracle_events = [e for e in events if 'oracle' in e.get('threat_type', '')]

        if len(oracle_events) >= 2:
            protocols = set(e['protocol'] for e in oracle_events)

            if len(protocols) >= 2:
                return {
                    'pattern': 'cross_dex_oracle_arbitrage',
                    'score': 0.85,
                    'severity': 'high',
                    'description': f'Oracle price deviation across {len(protocols)} protocols'
                }

        return None

    def _detect_bridge_exploit_chain(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect bridge exploit -> multi-chain attack
        """
        has_bridge_event = any(
            'bridge' in e.get('protocol', '') for e in events
        )

        unique_chains = set()
        for e in events:
            if 'chain' in e:
                unique_chains.add(e['chain'])

        if has_bridge_event and len(unique_chains) >= 2:
            return {
                'pattern': 'bridge_multi_chain_exploit',
                'score': 0.90,
                'severity': 'critical',
                'description': f'Bridge exploit affecting {len(unique_chains)} chains'
            }

        return None

    def _detect_liquidation_cascade(
        self,
        events: List[Dict[str, Any]]
    ) -> Optional[Dict[str, Any]]:
        """
        Detect liquidation cascade across protocols
        """
        liquidation_events = [
            e for e in events if 'liquidation' in e.get('threat_type', '')
        ]

        if len(liquidation_events) >= 3:
            total_value = sum(
                e.get('value_usd', 0) for e in liquidation_events
            )

            if total_value > 1000000:
                return {
                    'pattern': 'multi_protocol_liquidation_cascade',
                    'score': 0.88,
                    'severity': 'high',
                    'description': f'Liquidation cascade: ${total_value:,.0f} across {len(liquidation_events)} events'
                }

        return None

    def _cleanup_buffer(self):
        """
        Remove old events from buffer
        """
        if len(self.event_buffer) > self.max_buffer_size:
            self.event_buffer = self.event_buffer[-self.max_buffer_size:]

        cutoff_time = datetime.now(timezone.utc) - (self.correlation_window * 2)
        self.event_buffer = [
            e for e in self.event_buffer
            if e.get('timestamp', e['added_at']) > cutoff_time
        ]
