"""
Base Aggregator Class
All exploit aggregators inherit from this class
"""

from abc import ABC, abstractmethod
import httpx
from datetime import datetime, timezone
import logging
import hashlib
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)


class BaseAggregator(ABC):
    """Base class for all exploit aggregators"""

    def __init__(self, name: str):
        """Initialize aggregator"""
        self.name = name
        self.logger = logging.getLogger(f"aggregator.{name}")
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        """Async context manager entry"""
        await self._ensure_client()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit - cleanup resources"""
        await self.close()
        return False

    async def _ensure_client(self):
        """Ensure the httpx client is initialized"""
        if self._client is None:
            self._client = httpx.AsyncClient(
                headers={'User-Agent': 'KAMIYO Exploit Aggregator/1.0'},
                timeout=30.0
            )

    async def close(self):
        """Close the HTTP client and cleanup resources"""
        if self._client is not None:
            await self._client.aclose()
            self._client = None
            self.logger.debug(f"Closed client for {self.name}")

    def __del__(self):
        """Destructor - ensure client is closed"""
        if self._client is not None:
            try:
                import asyncio
                asyncio.get_event_loop().run_until_complete(self.close())
            except Exception:
                pass

    @abstractmethod
    async def fetch_exploits(self) -> List[Dict[str, Any]]:
        """
        Fetch exploits from source
        Returns list of exploits in standard format
        Must be implemented by subclasses
        """
        pass

    def normalize_exploit(self, raw_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert raw data to standard exploit format
        Override this method to customize normalization
        """
        return {
            'tx_hash': raw_data.get('tx_hash'),
            'chain': raw_data.get('chain'),
            'protocol': raw_data.get('protocol'),
            'amount_usd': float(raw_data.get('amount_usd', 0)),
            'timestamp': raw_data.get('timestamp', datetime.now(timezone.utc)),
            'source': self.name,
            'source_url': raw_data.get('source_url'),
            'category': raw_data.get('category'),
            'description': raw_data.get('description'),
            'recovery_status': raw_data.get('recovery_status')
        }

    def validate_exploit(self, exploit: Dict[str, Any]) -> bool:
        """
        Validate that exploit has required fields
        Returns True if valid, False otherwise
        """
        required = ['tx_hash', 'chain', 'protocol', 'timestamp']

        for field in required:
            if field not in exploit or exploit[field] is None:
                self.logger.warning(f"Invalid exploit: missing {field}")
                return False

        return True

    def generate_tx_hash(self, *args) -> str:
        """
        Generate pseudo tx_hash from identifying information
        Used when real tx_hash is not available
        """
        combined = '|'.join(str(arg) for arg in args)
        return 'generated-' + hashlib.sha256(combined.encode()).hexdigest()[:16]

    def parse_amount(self, text: str) -> float:
        """
        Parse dollar amount from text
        Handles formats like: $1M, $5.2 million, $100,000, etc.
        """
        if not text:
            return 0.0

        import re

        # Remove commas and $ signs
        text = text.replace(',', '').replace('$', '').lower()

        # Match patterns like "5.2 million" or "5.2M"
        million_match = re.search(r'([\d.]+)\s*(?:million|m)\b', text)
        if million_match:
            return float(million_match.group(1)) * 1_000_000

        # Match patterns like "5.2 billion" or "5.2B"
        billion_match = re.search(r'([\d.]+)\s*(?:billion|b)\b', text)
        if billion_match:
            return float(billion_match.group(1)) * 1_000_000_000

        # Match patterns like "5.2 thousand" or "5.2K"
        thousand_match = re.search(r'([\d.]+)\s*(?:thousand|k)\b', text)
        if thousand_match:
            return float(thousand_match.group(1)) * 1_000

        # Try to parse as plain number
        number_match = re.search(r'[\d.]+', text)
        if number_match:
            try:
                return float(number_match.group())
            except ValueError:
                pass

        return 0.0

    def extract_chain(self, text: str) -> Optional[str]:
        """
        Extract blockchain name from text
        Returns standardized chain name or None
        """
        if not text:
            return None

        text = text.lower()

        # Chain mappings (case insensitive)
        chain_keywords = {
            'ethereum': ['ethereum', 'eth', 'mainnet'],
            'bsc': ['bsc', 'binance smart chain', 'bnb chain'],
            'polygon': ['polygon', 'matic'],
            'arbitrum': ['arbitrum', 'arb'],
            'optimism': ['optimism', 'op'],
            'avalanche': ['avalanche', 'avax'],
            'fantom': ['fantom', 'ftm'],
            'solana': ['solana', 'sol'],
            'cosmos': ['cosmos', 'atom'],
            'osmosis': ['osmosis', 'osmo'],
            'aptos': ['aptos', 'apt'],
            'sui': ['sui'],
            'polkadot': ['polkadot', 'dot'],
            'starknet': ['starknet', 'stark'],
            'base': ['base'],
            'ronin': ['ronin'],
            'harmony': ['harmony', 'one']
        }

        for chain, keywords in chain_keywords.items():
            for keyword in keywords:
                if keyword in text:
                    return chain.title()

        return None

    async def make_request(
        self,
        url: str,
        method: str = 'GET',
        timeout: int = 30,
        **kwargs
    ) -> Optional[httpx.Response]:
        """
        Make HTTP request with error handling
        Returns Response object or None on failure
        """
        await self._ensure_client()

        try:
            if method.upper() == 'GET':
                response = await self._client.get(url, timeout=timeout, **kwargs)
            elif method.upper() == 'POST':
                response = await self._client.post(url, timeout=timeout, **kwargs)
            else:
                raise ValueError(f"Unsupported method: {method}")

            response.raise_for_status()
            return response

        except httpx.TimeoutException:
            self.logger.error(f"Request timeout: {url}")
        except httpx.ConnectError:
            self.logger.error(f"Connection error: {url}")
        except httpx.HTTPStatusError as e:
            self.logger.error(f"HTTP error {e.response.status_code}: {url}")
        except Exception as e:
            self.logger.error(f"Request failed: {e}")

        return None

    def parse_date(self, date_string: str) -> Optional[datetime]:
        """
        Parse date string to datetime object
        Handles multiple date formats
        """
        if not date_string:
            return None

        from dateutil import parser

        try:
            return parser.parse(date_string)
        except Exception as e:
            self.logger.warning(f"Failed to parse date '{date_string}': {e}")
            return None

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(name='{self.name}')>"
