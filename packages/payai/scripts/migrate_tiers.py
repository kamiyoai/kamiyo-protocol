#!/usr/bin/env python3
"""
Migrate old tier names to current tier system
Run: python3 scripts/migrate_tiers.py
"""

import os
import sys
from urllib.parse import urlparse

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("❌ psycopg2 not installed. Installing...")
    os.system("pip install psycopg2-binary")
    import psycopg2
    from psycopg2.extras import RealDictCursor

def get_db_connection():
    """Get database connection from DATABASE_URL"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("❌ DATABASE_URL environment variable not set")
        print("💡 Make sure it's set in your .env file or environment")
        sys.exit(1)

    print(f"📡 Connecting to database...")
    try:
        conn = psycopg2.connect(database_url)
        print("✅ Connected successfully")
        return conn
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        sys.exit(1)

def migrate_tiers():
    """Run tier migration"""
    print("🚀 Starting tier migration...\n")

    conn = get_db_connection()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    try:
        # 1. Check current state
        print("📊 Current state:")
        cursor.execute('SELECT tier, COUNT(*) as count FROM users GROUP BY tier ORDER BY count DESC')
        before = cursor.fetchall()
        print("Users by tier (before):")
        for row in before:
            print(f"  {row['tier']}: {row['count']} users")

        # 2. Check your specific account
        print("\n👤 Your account (before):")
        cursor.execute("SELECT email, tier, created_at FROM users WHERE email = 'dennisgoslar@gmail.com'")
        your_account = cursor.fetchone()
        if your_account:
            print(f"  Email: {your_account['email']}")
            print(f"  Tier: {your_account['tier']}")
            print(f"  Created: {your_account['created_at']}")
        else:
            print("  ⚠️  Account not found!")

        # 3. Migrate users table
        print("\n🔄 Migrating users table...")
        cursor.execute("""
            UPDATE users
            SET tier = CASE
                WHEN tier = 'ephemeral' THEN 'enterprise'
                WHEN tier = 'guide' THEN 'pro'
                WHEN tier = 'architect' THEN 'team'
                WHEN tier = 'creator' THEN 'enterprise'
                WHEN tier = 'kami' THEN 'enterprise'
                WHEN tier = 'kama' THEN 'enterprise'
                WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'
                ELSE tier
            END
            WHERE tier IS NOT NULL
        """)
        users_updated = cursor.rowcount
        print(f"✅ Updated {users_updated} user records")

        # 4. Specifically ensure your account is enterprise
        print("\n🎯 Ensuring your account is enterprise tier...")
        cursor.execute("""
            UPDATE users
            SET tier = 'enterprise'
            WHERE email = 'dennisgoslar@gmail.com'
        """)
        print("✅ Your account set to enterprise")

        # 5. Try to migrate subscriptions table if it exists
        try:
            print("\n🔄 Migrating subscriptions table...")
            cursor.execute("""
                UPDATE subscriptions
                SET tier = CASE
                    WHEN tier = 'ephemeral' THEN 'enterprise'
                    WHEN tier = 'guide' THEN 'pro'
                    WHEN tier = 'architect' THEN 'team'
                    WHEN tier = 'creator' THEN 'enterprise'
                    WHEN tier = 'kami' THEN 'enterprise'
                    WHEN tier = 'kama' THEN 'enterprise'
                    WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'
                    ELSE tier
                END
                WHERE tier IS NOT NULL
            """)
            subs_updated = cursor.rowcount
            print(f"✅ Updated {subs_updated} subscription records")
        except Exception as e:
            print(f"ℹ️  No subscriptions table or error: {e}")

        # Commit all changes
        conn.commit()

        # 6. Verify results
        print("\n📊 Final state:")
        cursor.execute('SELECT tier, COUNT(*) as count FROM users GROUP BY tier ORDER BY count DESC')
        after = cursor.fetchall()
        print("Users by tier (after):")
        for row in after:
            print(f"  {row['tier']}: {row['count']} users")

        print("\n👤 Your account (after):")
        cursor.execute("SELECT email, tier FROM users WHERE email = 'dennisgoslar@gmail.com'")
        your_account_after = cursor.fetchone()
        if your_account_after:
            print(f"  Email: {your_account_after['email']}")
            print(f"  Tier: {your_account_after['tier']}")

        print("\n✅ Migration completed successfully!")
        print(f"🎉 Your tier is now: {your_account_after['tier']}")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        conn.rollback()
        raise
    finally:
        cursor.close()
        conn.close()
        print("\n📡 Database connection closed")

if __name__ == "__main__":
    print("=" * 60)
    print("KAMIYO Tier Migration Script")
    print("=" * 60)
    print()

    migrate_tiers()

    print("\n✅ Done! You can now refresh your dashboard.")
    print("   Your tier should show 'Enterprise' instead of 'Ephemeral'")
