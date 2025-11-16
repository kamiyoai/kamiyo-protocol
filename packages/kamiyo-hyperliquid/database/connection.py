"""
Database Connection and Session Management
Handles PostgreSQL connections and SQLAlchemy session lifecycle
"""

import os
import logging
from contextlib import contextmanager
from typing import Generator, Optional
from sqlalchemy import create_engine, event, pool
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.exc import SQLAlchemyError
from .models import Base

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    Database connection and session manager

    Handles:
    - Connection pooling
    - Session lifecycle
    - Connection health checks
    - Automatic reconnection
    """

    def __init__(
        self,
        database_url: Optional[str] = None,
        pool_size: int = 5,
        max_overflow: int = 10,
        pool_timeout: int = 30,
        pool_recycle: int = 3600,
        echo: bool = False
    ):
        """
        Initialize database manager

        Args:
            database_url: PostgreSQL connection URL (defaults to env var)
            pool_size: Number of connections to maintain in pool
            max_overflow: Max connections beyond pool_size
            pool_timeout: Timeout in seconds for acquiring connection
            pool_recycle: Recycle connections after N seconds
            echo: Enable SQL query logging
        """
        # Get database URL from environment or parameter
        self.database_url = database_url or os.getenv(
            'DATABASE_URL',
            'postgresql://kamiyo:kamiyo_secure_password@localhost:5432/kamiyo_hyperliquid'
        )

        # Create engine with connection pooling
        self.engine = create_engine(
            self.database_url,
            poolclass=pool.QueuePool,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            pool_recycle=pool_recycle,
            pool_pre_ping=True,  # Verify connections before using
            echo=echo,
            connect_args={
                'connect_timeout': 10,
                'options': '-c timezone=utc'  # Force UTC timezone
            }
        )

        # Add connection pool listeners for monitoring
        event.listen(self.engine, 'connect', self._on_connect)
        event.listen(self.engine, 'checkout', self._on_checkout)

        # Create session factory
        self.SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=self.engine
        )

        logger.info(f"Database manager initialized with pool_size={pool_size}")

    def _on_connect(self, dbapi_conn, connection_record):
        """Called when new database connection is created"""
        logger.debug("New database connection established")

    def _on_checkout(self, dbapi_conn, connection_record, connection_proxy):
        """Called when connection is checked out from pool"""
        logger.debug("Connection checked out from pool")

    def create_tables(self, drop_existing: bool = False):
        """
        Create all database tables

        Args:
            drop_existing: If True, drop existing tables first (DANGEROUS!)
        """
        try:
            if drop_existing:
                logger.warning("Dropping all existing database tables!")
                Base.metadata.drop_all(bind=self.engine)

            Base.metadata.create_all(bind=self.engine)
            logger.info("Database tables created successfully")
        except SQLAlchemyError as e:
            logger.error(f"Error creating database tables: {e}")
            raise

    def health_check(self) -> bool:
        """
        Check database connectivity

        Returns:
            True if database is accessible, False otherwise
        """
        try:
            with self.get_session() as session:
                session.execute("SELECT 1")
            logger.debug("Database health check passed")
            return True
        except Exception as e:
            logger.error(f"Database health check failed: {e}")
            return False

    @contextmanager
    def get_session(self) -> Generator[Session, None, None]:
        """
        Context manager for database sessions

        Usage:
            with db.get_session() as session:
                session.query(Model).all()

        Yields:
            Database session
        """
        session = self.SessionLocal()
        try:
            yield session
            session.commit()
        except Exception as e:
            session.rollback()
            logger.error(f"Database session error: {e}", exc_info=True)
            raise
        finally:
            session.close()

    def get_session_direct(self) -> Session:
        """
        Get a database session (manual management)

        WARNING: Must be closed manually!
        Use get_session() context manager instead when possible.

        Returns:
            Database session
        """
        return self.SessionLocal()

    def close(self):
        """Close all database connections"""
        self.engine.dispose()
        logger.info("Database connections closed")

    def get_pool_status(self) -> dict:
        """
        Get connection pool statistics

        Returns:
            Dictionary with pool statistics
        """
        return {
            'pool_size': self.engine.pool.size(),
            'checked_out': self.engine.pool.checkedout(),
            'overflow': self.engine.pool.overflow(),
            'total_connections': self.engine.pool.size() + self.engine.pool.overflow()
        }


# ============================================================================
# Global database instance
# ============================================================================

# Singleton instance (initialized on first import)
_db_instance: Optional[DatabaseManager] = None


def get_database() -> DatabaseManager:
    """
    Get global database instance (singleton pattern)

    Returns:
        DatabaseManager instance
    """
    global _db_instance

    if _db_instance is None:
        # Initialize with environment variables
        echo_sql = os.getenv('DATABASE_ECHO', 'false').lower() == 'true'
        pool_size = int(os.getenv('DATABASE_POOL_SIZE', '5'))
        max_overflow = int(os.getenv('DATABASE_MAX_OVERFLOW', '10'))

        _db_instance = DatabaseManager(
            echo=echo_sql,
            pool_size=pool_size,
            max_overflow=max_overflow
        )

        logger.info("Global database instance created")

    return _db_instance


def init_database(database_url: Optional[str] = None, create_tables: bool = True):
    """
    Initialize database with custom configuration

    Args:
        database_url: PostgreSQL connection URL
        create_tables: If True, create tables if they don't exist
    """
    global _db_instance

    _db_instance = DatabaseManager(database_url=database_url)

    if create_tables:
        _db_instance.create_tables(drop_existing=False)

    logger.info("Database initialized successfully")


# ============================================================================
# Dependency injection for FastAPI
# ============================================================================

def get_db_session() -> Generator[Session, None, None]:
    """
    FastAPI dependency for database sessions

    Usage:
        @app.get("/users")
        def get_users(db: Session = Depends(get_db_session)):
            return db.query(User).all()
    """
    db = get_database()
    with db.get_session() as session:
        yield session


# ============================================================================
# Utility functions
# ============================================================================

def execute_raw_sql(sql: str, params: Optional[dict] = None) -> list:
    """
    Execute raw SQL query

    Args:
        sql: SQL query string
        params: Query parameters

    Returns:
        List of result rows
    """
    db = get_database()
    with db.get_session() as session:
        result = session.execute(sql, params or {})
        return result.fetchall()


def bulk_insert(model_class, data_list: list):
    """
    Bulk insert records

    Args:
        model_class: SQLAlchemy model class
        data_list: List of dictionaries with model data
    """
    db = get_database()
    with db.get_session() as session:
        objects = [model_class(**data) for data in data_list]
        session.bulk_save_objects(objects)
        session.commit()
        logger.info(f"Bulk inserted {len(data_list)} {model_class.__name__} records")


# ============================================================================
# Cleanup
# ============================================================================

def close_database():
    """Close database connections (call on application shutdown)"""
    global _db_instance
    if _db_instance:
        _db_instance.close()
        _db_instance = None
        logger.info("Database connections closed")
