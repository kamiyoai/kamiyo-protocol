"""
ERC-8004 Python SDK Client
Simple client for interacting with ERC-8004 API
"""

from typing import Optional, Dict, List, Any
import httpx
import asyncio
from datetime import datetime


class ERC8004Client:
    """
    Python SDK for ERC-8004 Agent Identity & Reputation System

    Example usage:
        client = ERC8004Client(
            api_url="https://api.kamiyo.ai",
            api_key="your_api_key_here"
        )

        # Register agent
        agent = await client.register_agent(
            owner_address="0x742d35Cc6634C0532925a3b844b5e3A3A3b7b7b7",
            chain="base",
            name="Trading Agent",
            description="Autonomous trading agent",
            endpoints=[{"name": "MCP", "endpoint": "https://agent.example.com/mcp"}]
        )

        # Get agent stats
        stats = await client.get_agent_stats(agent["agent_uuid"])
        print(f"Reputation: {stats['reputation_score']}")
    """

    def __init__(self, api_url: str, api_key: str, timeout: int = 30):
        """
        Initialize ERC-8004 client

        Args:
            api_url: Base URL for ERC-8004 API
            api_key: API key for authentication
            timeout: Request timeout in seconds
        """
        self.api_url = api_url.rstrip('/')
        self.api_key = api_key
        self.timeout = timeout
        self.headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }

    async def register_agent(
        self,
        owner_address: str,
        chain: str,
        name: str,
        description: str,
        endpoints: List[Dict[str, str]],
        image: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Register new ERC-8004 agent identity

        Args:
            owner_address: Owner wallet address
            chain: Blockchain network (base, ethereum, etc.)
            name: Agent name
            description: Agent description
            endpoints: List of endpoints (MCP, A2A, etc.)
            image: Optional agent image URL
            metadata: Optional additional metadata

        Returns:
            Agent registration response with agent_uuid and details
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

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.api_url}/api/v1/agents/register",
                json=payload,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def get_agent(self, agent_uuid: str) -> Dict[str, Any]:
        """
        Get agent details by UUID

        Args:
            agent_uuid: Agent UUID

        Returns:
            Agent details including registration file
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.api_url}/api/v1/agents/{agent_uuid}",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def get_agent_stats(self, agent_uuid: str) -> Dict[str, Any]:
        """
        Get agent statistics (reputation + payments)

        Args:
            agent_uuid: Agent UUID

        Returns:
            Combined agent statistics
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.api_url}/api/v1/agents/{agent_uuid}/stats",
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def submit_feedback(
        self,
        agent_uuid: str,
        client_address: str,
        score: int,
        tag1: Optional[str] = None,
        tag2: Optional[str] = None,
        file_uri: Optional[str] = None,
        file_hash: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Submit reputation feedback for an agent

        Args:
            agent_uuid: Agent UUID
            client_address: Client wallet address
            score: Reputation score (0-100)
            tag1: Optional category tag
            tag2: Optional subcategory tag
            file_uri: Optional feedback file URI
            file_hash: Optional file hash

        Returns:
            Feedback submission response
        """
        payload = {
            "agent_uuid": agent_uuid,
            "client_address": client_address,
            "score": score
        }

        if tag1:
            payload["tag1"] = tag1
        if tag2:
            payload["tag2"] = tag2
        if file_uri:
            payload["file_uri"] = file_uri
        if file_hash:
            payload["file_hash"] = file_hash

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.api_url}/api/v1/agents/feedback",
                json=payload,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def search_agents(
        self,
        chain: Optional[str] = None,
        owner_address: Optional[str] = None,
        min_reputation_score: Optional[int] = None,
        min_success_rate: Optional[float] = None,
        trust_level: Optional[str] = None,
        status: str = "active",
        limit: int = 50,
        offset: int = 0
    ) -> Dict[str, Any]:
        """
        Search and filter agents

        Args:
            chain: Filter by blockchain
            owner_address: Filter by owner
            min_reputation_score: Minimum reputation (0-100)
            min_success_rate: Minimum payment success rate (0-100)
            trust_level: Filter by trust level (excellent, good, fair, poor, new)
            status: Agent status (active, suspended, revoked)
            limit: Results per page (max 100)
            offset: Pagination offset

        Returns:
            Paginated list of agents with stats
        """
        params = {
            "status": status,
            "limit": limit,
            "offset": offset
        }

        if chain:
            params["chain"] = chain
        if owner_address:
            params["owner_address"] = owner_address
        if min_reputation_score is not None:
            params["min_reputation_score"] = min_reputation_score
        if min_success_rate is not None:
            params["min_success_rate"] = min_success_rate
        if trust_level:
            params["trust_level"] = trust_level

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.api_url}/api/v1/agents/",
                params=params,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def link_payment(
        self,
        agent_uuid: str,
        tx_hash: str,
        chain: str
    ) -> Dict[str, Any]:
        """
        Link x402 payment to agent identity

        Args:
            agent_uuid: Agent UUID
            tx_hash: Transaction hash
            chain: Blockchain network

        Returns:
            Payment link confirmation
        """
        payload = {
            "agent_uuid": agent_uuid,
            "tx_hash": tx_hash,
            "chain": chain
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.api_url}/api/v1/agents/link-payment",
                json=payload,
                headers=self.headers
            )
            response.raise_for_status()
            return response.json()

    async def health_check(self) -> Dict[str, Any]:
        """
        Check API health status

        Returns:
            Health check response with component status
        """
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.get(
                f"{self.api_url}/api/v1/agents/health"
            )
            response.raise_for_status()
            return response.json()
