#!/usr/bin/env python3
"""
Migrate old tier names - AUTO MODE (no confirmation needed)
"""

import sys
import psycopg2
from psycopg2.extras import RealDictCursor

database_url = "postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai"

print("="*60)
print("KAMIYO Tier Migration - AUTO MODE")
print("="*60)
print("\n🚀 Running migration automatically...\n")

try:
    conn = psycopg2.connect(database_url)
    print("✅ Connected to database\n")
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)

cursor = conn.cursor(cursor_factory=RealDictCursor)

try:
    # Find user
    cursor.execute('SELECT id, email FROM "User" WHERE email = %s', ('dennisgoslar@gmail.com',))
    user = cursor.fetchone()
    print(f"✅ Found: {user['email']}")
    user_id = user['id']

    # Check current subscription
    cursor.execute('SELECT tier, status FROM "Subscription" WHERE "userId" = %s', (user_id,))
    sub = cursor.fetchone()
    print(f"📊 Current tier: {sub['tier']}")

    # Migrate ALL subscriptions
    print(f"\n🔄 Migrating all subscriptions...")
    cursor.execute("""
        UPDATE "Subscription"
        SET tier = CASE
            WHEN tier = 'ephemeral' THEN 'enterprise'
            WHEN tier = 'guide' THEN 'pro'
            WHEN tier = 'architect' THEN 'team'
            WHEN tier = 'creator' THEN 'enterprise'
            WHEN tier = 'kami' THEN 'enterprise'
            WHEN tier = 'kama' THEN 'enterprise'
            WHEN tier NOT IN ('free', 'pro', 'team', 'enterprise') THEN 'free'
            ELSE tier
        END,
        "updatedAt" = NOW()
        WHERE tier IS NOT NULL
    """)
    print(f"✅ Updated {cursor.rowcount} subscriptions")

    # Commit
    conn.commit()
    print("\n💾 Committed to database")

    # Verify
    cursor.execute('SELECT tier, status FROM "Subscription" WHERE "userId" = %s', (user_id,))
    final = cursor.fetchone()

    print("\n" + "="*60)
    print("✅ MIGRATION COMPLETE!")
    print("="*60)
    print(f"🎉 Your new tier: {final['tier']}")
    print(f"📊 Status: {final['status']}")
    print("\n💡 Refresh your dashboard to see the change!")

except Exception as e:
    print(f"\n❌ Failed: {e}")
    conn.rollback()
    import traceback
    traceback.print_exc()
finally:
    cursor.close()
    conn.close()
