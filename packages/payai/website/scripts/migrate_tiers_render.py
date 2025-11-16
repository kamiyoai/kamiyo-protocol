#!/usr/bin/env python3
"""
Migrate old tier names to current tier system on Render PostgreSQL
Usage: python3 scripts/migrate_tiers_render.py <RENDER_DATABASE_URL>

Example:
python3 scripts/migrate_tiers_render.py "postgresql://user:pass@host:5432/db"
"""

import sys

# Check for psycopg2
try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("❌ psycopg2 not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary"])
    import psycopg2
    from psycopg2.extras import RealDictCursor

def migrate_tiers(database_url):
    """Run tier migration on Render PostgreSQL database"""
    print("🚀 Starting tier migration on Render PostgreSQL...\n")

    try:
        print(f"📡 Connecting to Render database...")
        conn = psycopg2.connect(database_url)
        print("✅ Connected successfully\n")
    except Exception as e:
        print(f"❌ Connection failed: {e}")
        print("\n💡 Make sure you copied the correct DATABASE_URL from Render")
        print("   Format: postgresql://user:password@host:port/database")
        sys.exit(1)

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
            print("  ⚠️  Account not found in database!")
            print("  This might not be the right database.")
            response = input("\nContinue anyway? (y/N): ")
            if response.lower() != 'y':
                print("Aborting.")
                sys.exit(0)

        # 3. Confirm before making changes
        print("\n⚠️  This will update the production database!")
        response = input("Continue with migration? (yes/no): ")
        if response.lower() != 'yes':
            print("Aborting.")
            sys.exit(0)

        # 4. Migrate users table
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

        # 5. Specifically ensure your account is enterprise
        print("\n🎯 Setting dennisgoslar@gmail.com to enterprise tier...")
        cursor.execute("""
            UPDATE users
            SET tier = 'enterprise'
            WHERE email = 'dennisgoslar@gmail.com'
        """)
        print("✅ Your account set to enterprise")

        # 6. Try to migrate subscriptions table if it exists
        try:
            print("\n🔄 Checking subscriptions table...")
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
            if subs_updated > 0:
                print(f"✅ Updated {subs_updated} subscription records")
            else:
                print("ℹ️  No subscription records needed updating")
        except Exception as e:
            print(f"ℹ️  Subscriptions table: {e}")

        # Commit all changes
        conn.commit()
        print("\n💾 Changes committed to database")

        # 7. Verify results
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

        print("\n" + "="*60)
        print("✅ Migration completed successfully!")
        print("="*60)
        print(f"🎉 Your tier is now: {your_account_after['tier']}")
        print("\n💡 Next steps:")
        print("   1. Refresh your dashboard at https://kamiyo.ai/dashboard")
        print("   2. You should now see 'Enterprise' instead of 'Ephemeral'")
        print("   3. All old tier names have been migrated")

    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        print("\n🔄 Rolling back changes...")
        conn.rollback()
        print("✅ Rolled back")
        raise
    finally:
        cursor.close()
        conn.close()
        print("\n📡 Database connection closed")

if __name__ == "__main__":
    print("="*60)
    print("KAMIYO Tier Migration Script - Render PostgreSQL")
    print("="*60)
    print()

    if len(sys.argv) != 2:
        print("❌ Missing DATABASE_URL argument")
        print("\nUsage:")
        print("  python3 scripts/migrate_tiers_render.py <DATABASE_URL>")
        print("\nExample:")
        print("  python3 scripts/migrate_tiers_render.py \"postgresql://user:pass@host:5432/db\"")
        print("\n💡 Get your DATABASE_URL from:")
        print("   Render Dashboard → Your PostgreSQL database → Connection Info")
        sys.exit(1)

    database_url = sys.argv[1]

    # Validate URL format
    if not database_url.startswith('postgresql://') and not database_url.startswith('postgres://'):
        print("❌ Invalid DATABASE_URL format")
        print("   Must start with 'postgresql://' or 'postgres://'")
        sys.exit(1)

    migrate_tiers(database_url)
