"""
Kamiyo Database Module
Provides database management for exploit aggregation
"""

import os
from .manager import DatabaseManager

# Conditionally import PostgresManager only if psycopg2 is available
try:
    from .postgres_manager import PostgresManager
    HAS_POSTGRES = True
except ImportError:
    HAS_POSTGRES = False
    PostgresManager = None

def get_db():
    """
    Get database manager based on environment.

    Production (DATABASE_URL set): PostgreSQL with connection pooling
    Development (no DATABASE_URL): SQLite for local testing

    Returns:
        DatabaseManager or PostgresManager instance
    """
    database_url = os.getenv('DATABASE_URL')

    if database_url and HAS_POSTGRES:
        # Production: PostgreSQL with connection pooling
        return PostgresManager(
            database_url=database_url,
            read_replica_url=os.getenv('READ_REPLICA_URL'),
            min_connections=int(os.getenv('DB_POOL_MIN', '2')),
            max_connections=int(os.getenv('DB_POOL_MAX', '20'))
        )
    else:
        # Development: SQLite for local testing
        # Also fallback if DATABASE_URL set but psycopg2 not installed
        if database_url and not HAS_POSTGRES:
            import logging
            logging.warning("DATABASE_URL set but psycopg2 not installed, falling back to SQLite")
        return DatabaseManager()

__all__ = ['DatabaseManager', 'PostgresManager', 'get_db']
