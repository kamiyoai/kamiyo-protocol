"""
ERC-8004 Agent Identity Python SDK
Client for interacting with KAMIYO agent identity system
"""

import httpx
from typing import Optional, List, Dict, Any
from decimal import Decimal


class ERC8004Client:
    """
    Client for ERC-8004 agent identity and reputation operations

    Usage:
        client = ERC8004Client(api_key="x402_live_...")
        agent = await client.register_agent(
            owner_address="0x...",
            name="My AI Agent",
            description="Trading agent for DeFi",
            endpoints=[{"name": "agentWallet", "endpoint": "0x..."}]
        )
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "https://kamiyo.ai",
        timeout: float = 30.0
    ):
        """
        Initialize ERC-8004 client

        Args:
            api_key: KAMIYO API key (optional for read operations)
            base_url: API base URL
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)

    async def register_agent(
        self,
        owner_address: str,
        name: str,
        description: str,
        endpoints: List[Dict[str, str]],
        image: Optional[str] = None,
        chain: str = "base",
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Register a new ERC-8004 agent identity

        Args:
            owner_address: Owner wallet address
            name: Agent name
            description: Agent description
            endpoints: List of endpoints (MCP, wallet, etc.)
            image: Agent image URL
            chain: Blockchain network
            metadata: Additional metadata

        Returns:
            Agent registration response
        """
        registration_file = {
            "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
            "name": name,
            "description": description,
            "endpoints": endpoints,
            "supportedTrust": ["reputation", "crypto-economic"]
        }

        if image:
            registration_file["image"] = image

        payload = {
            "owner_address": owner_address,
            "chain": chain,
            "registration_file": registration_file,
            "metadata": metadata or {}
        }

        response = await self._request(
            "POST",
            "/api/v1/agents/register",
            json=payload
        )

        return response

    async def get_agent(self, agent_uuid: str) -> Dict[str, Any]:
        """
        Get agent details

        Args:
            agent_uuid: Agent UUID

        Returns:
            Agent details
        """
        return await self._request("GET", f"/api/v1/agents/{agent_uuid}")

    async def get_agent_stats(self, agent_uuid: str) -> Dict[str, Any]:
        """
        Get agent statistics (reputation + payments)

        Args:
            agent_uuid: Agent UUID

        Returns:
            Combined agent statistics
        """
        return await self._request("GET", f"/api/v1/agents/{agent_uuid}/stats")

    async def get_agent_reputation(self, agent_uuid: str) -> Dict[str, Any]:
        """
        Get agent reputation summary

        Args:
            agent_uuid: Agent UUID

        Returns:
            Reputation summary
        """
        return await self._request("GET", f"/api/v1/agents/{agent_uuid}/reputation")

    async def submit_feedback(
        self,
        agent_uuid: str,
        client_address: str,
        score: int,
        tag1: Optional[str] = None,
        tag2: Optional[str] = None,
        file_uri: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Submit reputation feedback for an agent

        Args:
            agent_uuid: Agent UUID
            client_address: Client wallet address
            score: Reputation score (0-100)
            tag1: Primary tag
            tag2: Secondary tag
            file_uri: Optional feedback file URI

        Returns:
            Feedback submission response
        """
        if not 0 <= score <= 100:
            raise ValueError("Score must be between 0 and 100")

        payload = {
            "agent_uuid": agent_uuid,
            "client_address": client_address,
            "score": score,
            "tag1": tag1,
            "tag2": tag2,
            "file_uri": file_uri
        }

        return await self._request("POST", "/api/v1/agents/feedback", json=payload)

    async def link_payment(
        self,
        agent_uuid: str,
        tx_hash: str,
        chain: str
    ) -> Dict[str, Any]:
        """
        Link an x402 payment to an agent

        Args:
            agent_uuid: Agent UUID
            tx_hash: Payment transaction hash
            chain: Blockchain network

        Returns:
            Link confirmation
        """
        payload = {
            "agent_uuid": agent_uuid,
            "tx_hash": tx_hash,
            "chain": chain
        }

        return await self._request("POST", "/api/v1/agents/link-payment", json=payload)

    async def search_agents(
        self,
        owner_address: Optional[str] = None,
        chain: Optional[str] = None,
        min_reputation_score: Optional[int] = None,
        min_success_rate: Optional[float] = None,
        trust_level: Optional[str] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Search and filter agents

        Args:
            owner_address: Filter by owner
            chain: Filter by blockchain
            min_reputation_score: Minimum reputation score
            min_success_rate: Minimum payment success rate
            trust_level: Filter by trust level (excellent, good, fair, poor)
            limit: Results per page
            offset: Pagination offset

        Returns:
            Paginated agent list
        """
        params = {
            "limit": limit,
            "offset": offset
        }

        if owner_address:
            params["owner_address"] = owner_address
        if chain:
            params["chain"] = chain
        if min_reputation_score is not None:
            params["min_reputation_score"] = min_reputation_score
        if min_success_rate is not None:
            params["min_success_rate"] = min_success_rate
        if trust_level:
            params["trust_level"] = trust_level

        return await self._request("GET", "/api/v1/agents/", params=params)

    async def _request(
        self,
        method: str,
        path: str,
        **kwargs
    ) -> Dict[str, Any]:
        """
        Make HTTP request to API

        Args:
            method: HTTP method
            path: API path
            **kwargs: Additional request arguments

        Returns:
            Response JSON

        Raises:
            httpx.HTTPError: On request failure
        """
        url = f"{self.base_url}{path}"

        headers = kwargs.pop("headers", {})
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        response = await self._client.request(
            method,
            url,
            headers=headers,
            **kwargs
        )

        response.raise_for_status()
        return response.json()

    async def close(self):
        """Close HTTP client"""
        await self._client.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
