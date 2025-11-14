"""
Database transaction management for ERC-8004
Production-grade transaction handling with rollback support
"""

from contextlib import asynccontextmanager
import logging
from typing import Optional
import asyncpg

logger = logging.getLogger(__name__)


class RetryableError(Exception):
    """Errors that can be retried (network, connection issues)"""
    pass


class ValidationError(Exception):
    """Errors that cannot be retried (constraint violations)"""
    pass


class DatabaseTransactionManager:
    """
    Production-grade transaction management with nested transaction support

    Provides atomic operations for multi-step database operations with
    automatic rollback on errors and savepoint support for nested transactions.
    """

    def __init__(self, db):
        self.db = db
        self.transaction_depth = 0

    @asynccontextmanager
    async def transaction(self, isolation_level: str = 'READ COMMITTED'):
        """
        Context manager for database transactions with proper error handling

        Supports nested transactions using savepoints. Automatically commits
        on success and rolls back on any exception.

        Args:
            isolation_level: Transaction isolation level (READ COMMITTED, REPEATABLE READ, SERIALIZABLE)

        Usage:
            async with db_manager.transaction():
                await db.execute("INSERT ...")
                await db.execute("UPDATE ...")
                # Auto-commit on success, rollback on error
        """
        self.transaction_depth += 1
        transaction_id = f"txn_{self.transaction_depth}_{id(self)}"

        try:
            if self.transaction_depth == 1:
                await self.db.execute(f"BEGIN ISOLATION LEVEL {isolation_level}")
                logger.debug(f"Transaction started: {transaction_id}")
            else:
                await self.db.execute(f"SAVEPOINT {transaction_id}")
                logger.debug(f"Savepoint created: {transaction_id}")

            yield

            if self.transaction_depth == 1:
                await self.db.execute("COMMIT")
                logger.debug(f"Transaction committed: {transaction_id}")
            else:
                await self.db.execute(f"RELEASE SAVEPOINT {transaction_id}")
                logger.debug(f"Savepoint released: {transaction_id}")

        except asyncpg.PostgresError as e:
            # Categorize PostgreSQL errors
            if self.transaction_depth == 1:
                await self.db.execute("ROLLBACK")
                logger.error(f"Transaction rolled back: {transaction_id}", exc_info=True)
            else:
                await self.db.execute(f"ROLLBACK TO SAVEPOINT {transaction_id}")
                logger.error(f"Rolled back to savepoint: {transaction_id}", exc_info=True)

            # Differentiate error types
            if isinstance(e, (asyncpg.ConnectionDoesNotExistError, asyncpg.InterfaceError)):
                raise RetryableError(f"Database connection error: {e}") from e
            elif isinstance(e, (asyncpg.UniqueViolationError, asyncpg.ForeignKeyViolationError, asyncpg.CheckViolationError)):
                raise ValidationError(f"Database constraint violation: {e}") from e
            else:
                raise
        except Exception as e:
            if self.transaction_depth == 1:
                await self.db.execute("ROLLBACK")
                logger.error(f"Transaction rolled back: {transaction_id}", exc_info=True)
            else:
                await self.db.execute(f"ROLLBACK TO SAVEPOINT {transaction_id}")
                logger.error(f"Rolled back to savepoint: {transaction_id}", exc_info=True)
            raise
        finally:
            self.transaction_depth -= 1


async def execute_in_transaction(db, operations: list, isolation_level: str = 'READ COMMITTED') -> bool:
    """
    Execute multiple database operations in a single transaction

    Args:
        db: Database connection
        operations: List of (query, params) tuples
        isolation_level: Transaction isolation level

    Returns:
        True if all operations succeeded, False otherwise

    Example:
        success = await execute_in_transaction(db, [
            ("INSERT INTO agents ...", (uuid, agent_id)),
            ("INSERT INTO metadata ...", (uuid, key, value))
        ])
    """
    manager = DatabaseTransactionManager(db)

    try:
        async with manager.transaction(isolation_level):
            for query, params in operations:
                await db.execute(query, params)
        return True
    except Exception as e:
        logger.error(f"Transaction failed: {e}")
        return False
