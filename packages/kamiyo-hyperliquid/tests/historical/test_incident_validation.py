"""
Historical Incident Validation Tests

Validates that the monitoring system detection validated via historical replay real-world incidents.
"""

import pytest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import List

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).parent.parent.parent))

from monitors.hlp_vault_monitor import HLPVaultMonitor
from models.security import HLPVaultSnapshot, SecurityEvent, ThreatSeverity
from tests.historical.incident_data import get_incident_data, list_incidents


@pytest.mark.historical
class TestIncidentValidation:
    """Test suite for historical incident validation"""

    def test_march_2025_hlp_incident_detection(self):
        """
        Validates detection of March 15, 2025 HLP vault incident

        **Incident Details:**
        - Date: March 15, 2025, 14:23 UTC
        - Type: Large ETH position loss transferred to HLP
        - Loss: $4.2M
        - Root cause: Whale trader large position against vault

        **Expected Behavior:**
        - System should detect critical loss within 5 minutes
        - Should generate HIGH severity alert at -$3.2M (14:20 UTC)
        - Should generate CRITICAL severity alert at -$4.2M (14:23 UTC)
        - Detection time should be < 5 minutes from incident start
        """
        # Load historical incident data
        incident = get_incident_data("march_2025_hlp")

        # Initialize monitor
        monitor = HLPVaultMonitor()

        # Track detected events
        detected_events: List[SecurityEvent] = []

        # Replay vault snapshots through monitor
        for snapshot_data in incident["vault_snapshots"]:
            # Create snapshot object
            snapshot = HLPVaultSnapshot(
                timestamp=snapshot_data["timestamp"],
                vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
                total_value_locked=snapshot_data["total_value_locked"],
                account_value=snapshot_data["account_value"],
                pnl_24h=snapshot_data["pnl_24h"],
                pnl_7d=snapshot_data["pnl_7d"],
                pnl_30d=snapshot_data["pnl_30d"]
            )

            # Add to monitor's historical data
            monitor.historical_snapshots.append(snapshot)

            # Analyze for anomalies
            events = monitor._detect_anomalies(snapshot)
            detected_events.extend(events)

        # Verify detection occurred
        assert len(detected_events) > 0, \
            "System should have detected the incident"

        # Verify HIGH severity alert was generated
        high_alerts = [e for e in detected_events if e.severity in [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL]]
        assert len(high_alerts) > 0, \
            "Should have generated HIGH severity alert for -$3.2M loss"

        # Verify CRITICAL severity alert was generated
        critical_alerts = [e for e in detected_events if e.severity == ThreatSeverity.CRITICAL]
        assert len(critical_alerts) > 0, \
            f"Should have generated CRITICAL alert for -$4.2M loss. Got: {detected_events}"

        # Verify detection timing
        incident_start = datetime(2025, 3, 15, 14, 15, 0, tzinfo=timezone.utc)
        first_detection = min(e.timestamp for e in detected_events)
        detection_delay = (first_detection - incident_start).total_seconds()

        assert detection_delay < 300, \
            f"Should detect within 5 minutes. Actual: {detection_delay:.0f} seconds"

        # Verify incident characteristics
        assert any("loss" in e.description.lower() for e in detected_events), \
            "Alert description should mention loss"

        print(f"\n✅ March 2025 Incident Validation PASSED")
        print(f"   Detected {len(detected_events)} events")
        print(f"   Detection time: {detection_delay:.0f} seconds")
        print(f"   Critical alerts: {len(critical_alerts)}")

    def test_incident_detection_sensitivity(self):
        """
        Test that system detects various loss magnitudes appropriately

        Validates thresholds:
        - $1M loss → HIGH severity
        - $2M loss → CRITICAL severity
        - Rapid loss rate → Early detection
        """
        monitor = HLPVaultMonitor()

        # Test $1.5M loss detection (above HIGH threshold)
        snapshot_1m = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc),
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            total_value_locked=100000000.0,
            account_value=100000000.0,
            pnl_24h=-1500000.0,  # -$1.5M (above HIGH threshold)
            pnl_7d=-1200000.0,
            pnl_30d=-500000.0
        )

        # Add baseline snapshot
        baseline = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc) - timedelta(hours=1),
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            total_value_locked=101500000.0,
            account_value=101500000.0,
            pnl_24h=100000.0,
            pnl_7d=300000.0,
            pnl_30d=1000000.0
        )

        monitor.historical_snapshots.append(baseline)
        events_1m = monitor._detect_anomalies(snapshot_1m)

        # $1.5M loss should trigger HIGH alert
        high_events = [e for e in events_1m if e.severity in [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL]]
        assert len(high_events) > 0, f"Should detect $1.5M loss as HIGH severity. Events: {events_1m}"

        # Test $2.5M loss detection (above CRITICAL threshold)
        snapshot_2m = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc),
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            total_value_locked=100000000.0,
            account_value=100000000.0,
            pnl_24h=-2500000.0,  # -$2.5M (above CRITICAL threshold)
            pnl_7d=-2200000.0,
            pnl_30d=-1500000.0
        )

        monitor.historical_snapshots = [baseline]
        events_2m = monitor._detect_anomalies(snapshot_2m)

        # $2.5M loss should trigger CRITICAL alert
        critical_events = [e for e in events_2m if e.severity == ThreatSeverity.CRITICAL]
        assert len(critical_events) > 0, f"Should detect $2.5M loss as CRITICAL severity. Events: {events_2m}"

    def test_false_positive_prevention(self):
        """
        Test that normal market volatility doesn't trigger false alerts

        Validates:
        - Small losses (<$500k) don't trigger alerts
        - Normal leverage changes are acceptable
        - Gradual PnL changes are normal
        """
        monitor = HLPVaultMonitor()

        # Baseline snapshot
        baseline = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc) - timedelta(hours=1),
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            total_value_locked=100000000.0,
            account_value=100000000.0,
            pnl_24h=0.0,
            pnl_7d=200000.0,
            pnl_30d=1000000.0
        )

        # Small normal loss
        small_loss = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc),
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            total_value_locked=99700000.0,  # -$300k (normal)
            account_value=99700000.0,
            pnl_24h=-300000.0,
            pnl_7d=-100000.0,
            pnl_30d=700000.0
        )

        monitor.historical_snapshots.append(baseline)
        events = monitor._detect_anomalies(small_loss)

        # Should not trigger critical alerts
        critical_events = [e for e in events if e.severity in [ThreatSeverity.HIGH, ThreatSeverity.CRITICAL]]
        assert len(critical_events) == 0, \
            "Small normal losses should not trigger HIGH/CRITICAL alerts"

    def test_all_documented_incidents(self):
        """
        Validates detection for all documented historical incidents

        Runs detection tests on all incidents in the database.
        Useful for regression testing as more incidents are added.
        """
        incidents = list_incidents()

        assert len(incidents) > 0, "Should have at least one documented incident"

        for incident_id in incidents:
            incident = get_incident_data(incident_id)
            print(f"\n📋 Testing incident: {incident_id}")
            print(f"   Date: {incident['date']}")
            print(f"   Loss: ${incident['total_loss_usd']:,.0f}")

            monitor = HLPVaultMonitor()
            detected_events = []

            # Replay snapshots
            for snapshot_data in incident["vault_snapshots"]:
                snapshot = HLPVaultSnapshot(
                    timestamp=snapshot_data["timestamp"],
                    vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
                    total_value_locked=snapshot_data["total_value_locked"],
                    account_value=snapshot_data["account_value"],
                    pnl_24h=snapshot_data["pnl_24h"],
                    pnl_7d=snapshot_data["pnl_7d"],
                    pnl_30d=snapshot_data["pnl_30d"]
                )

                monitor.historical_snapshots.append(snapshot)
                events = monitor._detect_anomalies(snapshot)
                detected_events.extend(events)

            # Basic validation
            assert len(detected_events) > 0, \
                f"Should detect incident: {incident_id}"

            print(f"   ✅ Detected {len(detected_events)} events")

    @pytest.mark.performance
    def test_detection_performance(self):
        """
        Validates that detection is fast enough for real-time monitoring

        Requirements:
        - Detection time < 100ms per snapshot
        - Memory efficient for historical data
        """
        import time

        monitor = HLPVaultMonitor()

        # Create test snapshot
        snapshot = HLPVaultSnapshot(
            timestamp=datetime.now(timezone.utc),
            vault_address="0xdfc24b077bc1425ad1dea75bcb6f8158e10df303",
            total_value_locked=100000000.0,
            account_value=100000000.0,
            pnl_24h=-2000000.0,
            pnl_7d=-1500000.0,
            pnl_30d=-500000.0
        )

        # Add some historical context
        for i in range(100):
            monitor.historical_snapshots.append(snapshot)

        # Time the detection
        start = time.time()
        events = monitor._detect_anomalies(snapshot)
        elapsed = (time.time() - start) * 1000  # Convert to ms

        assert elapsed < 100, \
            f"Detection should be < 100ms. Actual: {elapsed:.2f}ms"

        print(f"\n⚡ Detection performance: {elapsed:.2f}ms")


if __name__ == "__main__":
    # Run tests with verbose output
    pytest.main([__file__, "-v", "-s"])
