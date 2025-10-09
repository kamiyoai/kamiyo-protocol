"""
Database connection configuration for Kamiyo API
Supports both SQLite (local dev) and PostgreSQL (production)
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Get database URL from environment variable
DATABASE_URL = os.getenv("DATABASE_URL")

# If no DATABASE_URL is set, default to SQLite
if not DATABASE_URL:
    # Local development: use SQLite
    DATABASE_URL = "sqlite:///./data/kamiyo.db"
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False}  # Needed for SQLite
    )
else:
    # Production: use PostgreSQL
    # Handle Render's postgres:// URL format (needs to be postgresql://)
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,  # Verify connections before using
        pool_size=10,
        max_overflow=20
    )

# Create SessionLocal class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create Base class for models
Base = declarative_base()

def get_db():
    """
    Dependency function to get database session
    Usage in FastAPI:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)):
            ...
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Initialize database tables
    Call this on application startup
    """
    Base.metadata.create_all(bind=engine)
    print(f"✓ Database initialized: {DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL}")
