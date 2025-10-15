# -*- coding: utf-8 -*-
"""
GitHub Security Advisories Aggregator
Fetches security advisories for blockchain/crypto projects from GitHub
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from aggregators.base import BaseAggregator
from datetime import datetime
from typing import List, Dict, Any
import json


class GitHubAdvisoriesAggregator(BaseAggregator):
    """Aggregates security advisories from GitHub Security Advisory Database"""

    def __init__(self, github_token: str = None):
        super().__init__('github_advisories')
        self.api_url = 'https://api.github.com/advisories'
        self.github_token = github_token or os.getenv('GITHUB_TOKEN')

        # Add GitHub token if available
        if self.github_token:
            self.session.headers.update({
                'Authorization': f'token {self.github_token}'
            })

    def fetch_exploits(self) -> List[Dict[str, Any]]:
        """Fetch security advisories from GitHub"""

        self.logger.info(f"Fetching from {self.api_url}")

        exploits = []

        try:
            # Query for blockchain/crypto related advisories
            # Filter for Solidity, Web3, and cryptocurrency ecosystems
            ecosystems = ['npm', 'pip', 'go', 'rust', 'maven']
            keywords = ['ethereum', 'solidity', 'web3', 'blockchain', 'crypto', 'defi']

            for ecosystem in ecosystems:
                page = 1
                while page <= 3:  # Limit to 3 pages per ecosystem
                    params = {
                        'ecosystem': ecosystem,
                        'per_page': 100,
                        'page': page,
                        'sort': 'published',
                        'direction': 'desc'
                    }

                    response = self.make_request(
                        self.api_url,
                        headers={'Accept': 'application/vnd.github+json'}
                    )

                    if not response:
                        break

                    advisories = response.json()
                    if not isinstance(advisories, list) or not advisories:
                        break

                    # Filter for crypto/blockchain related advisories
                    for advisory in advisories:
                        try:
                            # Check if related to crypto/blockchain
                            summary = (advisory.get('summary', '') + ' ' +
                                     advisory.get('description', '')).lower()

                            if not any(keyword in summary for keyword in keywords):
                                continue

                            exploit = self._parse_advisory(advisory)
                            if exploit and self.validate_exploit(exploit):
                                exploits.append(exploit)

                        except Exception as e:
                            self.logger.error(f"Failed to parse advisory: {e}")
                            continue

                    page += 1

            self.logger.info(f"Fetched {len(exploits)} advisories from GitHub")

        except Exception as e:
            self.logger.error(f"Failed to fetch GitHub advisories: {e}")

        return exploits

    def _parse_advisory(self, advisory: Dict[str, Any]) -> Dict[str, Any]:
        """Parse GitHub advisory into standardized exploit format"""

        # Extract basic info
        ghsa_id = advisory.get('ghsa_id', '')
        summary = advisory.get('summary', 'Unknown')
        description = advisory.get('description', '')
        severity = advisory.get('severity', 'unknown')

        # Extract affected package/protocol
        affected = advisory.get('vulnerabilities', [])
        if affected and len(affected) > 0:
            package = affected[0].get('package', {}).get('name', 'Unknown')
        else:
            package = self._extract_package_from_summary(summary)

        # Extract chain (if mentioned)
        chain = self.extract_chain(description + ' ' + summary) or 'Multiple'

        # Parse published date
        published = advisory.get('published_at') or advisory.get('created_at')
        timestamp = self.parse_date(published) if published else datetime.now()

        # Generate tx_hash (advisories don't have blockchain tx hashes)
        tx_hash = self.generate_tx_hash(ghsa_id, package, timestamp.isoformat()[:10])

        # Amount (not available in advisories)
        amount_usd = 0.0

        # Categorize
        category = self._categorize_advisory(advisory)

        # Build source URL
        source_url = advisory.get('html_url') or f"https://github.com/advisories/{ghsa_id}"

        return {
            'tx_hash': tx_hash,
            'chain': chain,
            'protocol': package,
            'amount_usd': amount_usd,
            'timestamp': timestamp,
            'source': self.name,
            'source_url': source_url,
            'category': category,
            'description': f"[{severity.upper()}] {summary}: {description[:400]}",
            'recovery_status': None
        }

    def _extract_package_from_summary(self, summary: str) -> str:
        """Extract package/protocol name from summary"""

        if not summary:
            return 'Unknown'

        # Common patterns in summaries
        # "Vulnerability in [package]"
        # "[package] has vulnerability"

        words = summary.split()

        # Take first capitalized word or first word
        for word in words:
            if len(word) > 2 and not word.lower() in ['the', 'in', 'has', 'vulnerability']:
                return word.strip('.,;:')

        return summary.split()[0] if words else 'Unknown'

    def _categorize_advisory(self, advisory: Dict[str, Any]) -> str:
        """Categorize the type of vulnerability"""

        text = (advisory.get('summary', '') + ' ' +
                advisory.get('description', '')).lower()

        categories = {
            'Smart Contract Bug': ['smart contract', 'solidity', 'contract'],
            'Reentrancy': ['reentrancy', 'reentrant'],
            'Access Control': ['access control', 'authorization', 'authentication'],
            'Integer Overflow': ['overflow', 'underflow', 'integer'],
            'Cryptographic': ['cryptographic', 'encryption', 'signature'],
            'Denial of Service': ['dos', 'denial of service', 'resource exhaustion'],
            'Code Injection': ['injection', 'arbitrary code', 'remote code'],
        }

        for category, keywords in categories.items():
            for keyword in keywords:
                if keyword in text:
                    return category

        # Fallback to CWE mapping
        cwes = advisory.get('cwe_ids', [])
        if cwes:
            return f"CWE-{cwes[0]}" if isinstance(cwes, list) else 'Unknown'

        return 'Security Advisory'


# Test function
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)

    aggregator = GitHubAdvisoriesAggregator()
    exploits = aggregator.fetch_exploits()

    print(f"\nFetched {len(exploits)} advisories from GitHub:")
    for i, exploit in enumerate(exploits[:5], 1):
        print(f"\n{i}. {exploit['protocol']}")
        print(f"   Chain: {exploit['chain']}")
        print(f"   Date: {exploit['timestamp'].strftime('%Y-%m-%d')}")
        print(f"   Category: {exploit['category']}")
        print(f"   Description: {exploit['description'][:100]}...")
