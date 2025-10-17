#!/usr/bin/env python3
"""
Real-Time Protocol Monitoring System
Continuously monitors protocols for new vulnerabilities
"""

import json
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List
from dataclasses import dataclass, asdict
import hashlib

@dataclass
class MonitorAlert:
    timestamp: str
    protocol: str
    alert_type: str
    severity: str
    message: str
    file_path: str = ''
    line_number: int = 0
    confidence: float = 0.0

class ProtocolMonitor:
    def __init__(self, config_path: str = None):
        self.monitored_protocols = []
        self.alert_history = []
        self.file_hashes = {}

        if config_path and Path(config_path).exists():
            with open(config_path) as f:
                config = json.load(f)
                self.monitored_protocols = config.get('protocols', [])

    def add_protocol(self, name: str, path: str, scan_interval: int = 300):
        """Add protocol to monitoring"""
        protocol = {
            'name': name,
            'path': path,
            'scan_interval': scan_interval,
            'last_scan': None,
            'vulnerability_count': 0,
            'status': 'active'
        }
        self.monitored_protocols.append(protocol)

    def scan_protocol(self, protocol: Dict) -> List[MonitorAlert]:
        """Scan protocol for vulnerabilities"""
        alerts = []
        protocol_path = Path(protocol['path'])

        if not protocol_path.exists():
            alerts.append(MonitorAlert(
                timestamp=datetime.now().isoformat(),
                protocol=protocol['name'],
                alert_type='SYSTEM',
                severity='WARNING',
                message=f"Protocol path not found: {protocol['path']}"
            ))
            return alerts

        # Check for file changes
        for file_path in protocol_path.rglob('*.rs'):
            if self._file_changed(str(file_path)):
                alerts.append(MonitorAlert(
                    timestamp=datetime.now().isoformat(),
                    protocol=protocol['name'],
                    alert_type='FILE_CHANGE',
                    severity='INFO',
                    message=f"File modified: {file_path.name}",
                    file_path=str(file_path)
                ))

        # Simulate vulnerability detection (in real system, this would call scanners)
        if len(alerts) > 0:
            alerts.append(MonitorAlert(
                timestamp=datetime.now().isoformat(),
                protocol=protocol['name'],
                alert_type='RESCAN_NEEDED',
                severity='MEDIUM',
                message=f"Code changes detected. Recommend full rescan.",
                confidence=0.85
            ))

        return alerts

    def _file_changed(self, file_path: str) -> bool:
        """Check if file has changed since last scan"""
        try:
            with open(file_path, 'rb') as f:
                content = f.read()
                file_hash = hashlib.md5(content).hexdigest()

                if file_path in self.file_hashes:
                    if self.file_hashes[file_path] != file_hash:
                        self.file_hashes[file_path] = file_hash
                        return True
                    return False
                else:
                    self.file_hashes[file_path] = file_hash
                    return False
        except Exception:
            return False

    def monitor_loop(self, duration_seconds: int = 60):
        """Run monitoring loop"""
        start_time = time.time()
        scan_count = 0

        print("="*70)
        print("REAL-TIME PROTOCOL MONITORING SYSTEM")
        print("="*70)
        print(f"Monitoring {len(self.monitored_protocols)} protocols")
        print(f"Duration: {duration_seconds}s")
        print()

        while (time.time() - start_time) < duration_seconds:
            for protocol in self.monitored_protocols:
                # Check if it's time to scan
                if protocol['last_scan'] is None:
                    should_scan = True
                else:
                    time_since_scan = time.time() - protocol['last_scan']
                    should_scan = time_since_scan >= protocol['scan_interval']

                if should_scan:
                    print(f"[{datetime.now().strftime('%H:%M:%S')}] Scanning {protocol['name']}...")
                    alerts = self.scan_protocol(protocol)

                    if alerts:
                        for alert in alerts:
                            self.alert_history.append(alert)
                            self._print_alert(alert)

                    protocol['last_scan'] = time.time()
                    protocol['vulnerability_count'] = len([a for a in alerts if a.alert_type != 'SYSTEM'])
                    scan_count += 1

            time.sleep(5)  # Check every 5 seconds

        print()
        print(f"✅ Monitoring complete. Performed {scan_count} scans.")
        print(f"   Total alerts: {len(self.alert_history)}")

    def _print_alert(self, alert: MonitorAlert):
        """Print formatted alert"""
        severity_colors = {
            'CRITICAL': '\033[91m',
            'HIGH': '\033[93m',
            'MEDIUM': '\033[33m',
            'LOW': '\033[92m',
            'INFO': '\033[94m',
            'WARNING': '\033[95m'
        }
        reset = '\033[0m'

        color = severity_colors.get(alert.severity, '')
        print(f"  [{alert.severity}] {alert.alert_type}: {alert.message}")

    def generate_report(self) -> Dict:
        """Generate monitoring report"""
        report = {
            'report_generated': datetime.now().isoformat(),
            'total_protocols': len(self.monitored_protocols),
            'total_alerts': len(self.alert_history),
            'alerts_by_severity': {},
            'alerts_by_type': {},
            'protocols': []
        }

        # Count alerts by severity and type
        for alert in self.alert_history:
            # By severity
            if alert.severity not in report['alerts_by_severity']:
                report['alerts_by_severity'][alert.severity] = 0
            report['alerts_by_severity'][alert.severity] += 1

            # By type
            if alert.alert_type not in report['alerts_by_type']:
                report['alerts_by_type'][alert.alert_type] = 0
            report['alerts_by_type'][alert.alert_type] += 1

        # Protocol summaries
        for protocol in self.monitored_protocols:
            protocol_alerts = [a for a in self.alert_history if a.protocol == protocol['name']]
            report['protocols'].append({
                'name': protocol['name'],
                'status': protocol['status'],
                'last_scan': datetime.fromtimestamp(protocol['last_scan']).isoformat() if protocol['last_scan'] else None,
                'vulnerability_count': protocol['vulnerability_count'],
                'alert_count': len(protocol_alerts)
            })

        return report

    def save_report(self, output_path: str):
        """Save monitoring report"""
        report = self.generate_report()

        # Save report
        with open(output_path, 'w') as f:
            json.dump(report, f, indent=2)

        # Save alert history
        alerts_path = Path(output_path).parent / 'alert_history.json'
        with open(alerts_path, 'w') as f:
            json.dump([asdict(a) for a in self.alert_history], f, indent=2)

        print(f"\n📊 Report saved: {output_path}")
        print(f"📋 Alert history saved: {alerts_path}")


def main():
    base_dir = Path(__file__).resolve().parent.parent

    # Initialize monitor
    monitor = ProtocolMonitor()

    # Add protocols to monitor
    monitor.add_protocol(
        name='CosmWasm Core',
        path=str(base_dir / 'targets/cosmwasm'),
        scan_interval=30  # Scan every 30 seconds
    )

    monitor.add_protocol(
        name='Osmosis DEX',
        path=str(base_dir / 'targets/osmosis'),
        scan_interval=60  # Scan every 60 seconds
    )

    monitor.add_protocol(
        name='Sample CosmWasm',
        path=str(base_dir / 'targets/sample-cosmwasm'),
        scan_interval=15  # Scan every 15 seconds
    )

    # Run monitoring for 1 minute (demo)
    monitor.monitor_loop(duration_seconds=60)

    # Generate and save report
    report_path = base_dir / 'intelligence/monitoring/monitoring_report.json'
    report_path.parent.mkdir(parents=True, exist_ok=True)
    monitor.save_report(str(report_path))

    # Print summary
    report = monitor.generate_report()
    print("\n" + "="*70)
    print("MONITORING SUMMARY")
    print("="*70)
    print(f"Protocols Monitored: {report['total_protocols']}")
    print(f"Total Alerts: {report['total_alerts']}")
    print()
    print("Alerts by Severity:")
    for severity, count in sorted(report['alerts_by_severity'].items()):
        print(f"  {severity}: {count}")
    print()
    print("Protocol Status:")
    for protocol in report['protocols']:
        print(f"  {protocol['name']}:")
        print(f"    Status: {protocol['status']}")
        print(f"    Vulnerabilities: {protocol['vulnerability_count']}")
        print(f"    Alerts: {protocol['alert_count']}")
    print()


if __name__ == '__main__':
    main()
