#!/usr/bin/env python3
"""
Migrate old tier names to current tier system on Render PostgreSQL
This version works with the actual Prisma schema (User and Subscription tables)
"""

import sys
import psycopg2
from psycopg2.extras import RealDictCursor

database_url = "postgresql://kamiyo_ai_user:R2Li9tsBEVNg9A8TDPCPmXHnuM8KgXi9@dpg-cv0rgihopnds73dempsg-a.singapore-postgres.render.com/kamiyo_ai"

print("="*60)
print("KAMIYO Tier Migration Script - Render PostgreSQL")
print("="*60)
print("\n🚀 Starting tier migration...\n")

try:
    print(f"📡 Connecting to Render database...")
    conn = psycopg2.connect(database_url)
    print("✅ Connected successfully\n")
except Exception as e:
    print(f"❌ Connection failed: {e}")
    sys.exit(1)

cursor = conn.cursor(cursor_factory=RealDictCursor)

try:
    # 1. Find your user account
    print("👤 Looking for your account...")
    cursor.execute('SELECT id, email FROM "User" WHERE email = %s', ('admin@kamiyo.ai',))
    user = cursor.fetchone()

    if not user:
        print("❌ Account not found!")
        sys.exit(1)

    print(f"✅ Found account: {user['email']} (ID: {user['id']})")
    user_id = user['id']

    # 2. Check current subscription
    print("\n📊 Current subscription:")
    cursor.execute('SELECT id, "userId", tier, status FROM "Subscription" WHERE "userId" = %s', (user_id,))
    sub = cursor.fetchone()

    if sub:
        print(f"  Tier: {sub['tier']}")
        print(f"  Status: {sub['status']}")
        print(f"  Subscription ID: {sub['id']}")
    else:
        print("  ⚠️  No subscription found - will create one")

    # 3. Check all tiers in database
    print("\n📊 All subscriptions by tier (before):")
    cursor.execute('SELECT tier, COUNT(*) as count FROM "Subscription" GROUP BY tier ORDER BY count DESC')
    before = cursor.fetchall()
    for row in before:
        print(f"  {row['tier']}: {row['count']} subscriptions")

    # 4. Confirm migration
    print("\n⚠️  This will update the production database!")
    print("   Old tiers will be migrated:")
    print("   - ephemeral/creator/kami → enterprise")
    print("   - guide → pro")
    print("   - architect → team")
    response = input("\nContinue? (yes/no): ")
    if response.lower() != 'yes':
        print("Aborting.")
        sys.exit(0)

    # 5. Migrate all subscriptions
    print("\n🔄 Migrating Subscription table...")
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
        END
        WHERE tier IS NOT NULL
    """)
    subs_updated = cursor.rowcount
    print(f"✅ Updated {subs_updated} subscription records")

    # 6. Ensure your subscription exists and is enterprise
    print("\n🎯 Ensuring your subscription is enterprise...")
    cursor.execute('SELECT id FROM "Subscription" WHERE "userId" = %s', (user_id,))
    existing_sub = cursor.fetchone()

    if existing_sub:
        # Update existing
        cursor.execute("""
            UPDATE "Subscription"
            SET tier = 'enterprise', status = 'active', "updatedAt" = NOW()
            WHERE "userId" = %s
        """, (user_id,))
        print(f"✅ Updated your subscription to enterprise")
    else:
        # Create new subscription
        cursor.execute("""
            INSERT INTO "Subscription" (id, "userId", tier, status, "createdAt", "updatedAt")
            VALUES (gen_random_uuid()::text, %s, 'enterprise', 'active', NOW(), NOW())
        """, (user_id,))
        print(f"✅ Created new enterprise subscription for your account")

    # Commit changes
    conn.commit()
    print("\n💾 Changes committed to database")

    # 7. Verify results
    print("\n📊 All subscriptions by tier (after):")
    cursor.execute('SELECT tier, COUNT(*) as count FROM "Subscription" GROUP BY tier ORDER BY count DESC')
    after = cursor.fetchall()
    for row in after:
        print(f"  {row['tier']}: {row['count']} subscriptions")

    print("\n👤 Your subscription (after):")
    cursor.execute('SELECT tier, status FROM "Subscription" WHERE "userId" = %s', (user_id,))
    your_sub = cursor.fetchone()
    if your_sub:
        print(f"  Tier: {your_sub['tier']}")
        print(f"  Status: {your_sub['status']}")

    print("\n" + "="*60)
    print("✅ Migration completed successfully!")
    print("="*60)
    print(f"🎉 Your tier is now: {your_sub['tier']}")
    print("\n💡 Next steps:")
    print("   1. Refresh your dashboard at https://kamiyo.ai/dashboard")
    print("   2. You should now see 'Enterprise' instead of 'Ephemeral'")
    print("   3. If it still shows old tier, try logging out and back in")

except Exception as e:
    print(f"\n❌ Migration failed: {e}")
    print("\n🔄 Rolling back changes...")
    conn.rollback()
    print("✅ Rolled back")
    import traceback
    traceback.print_exc()
finally:
    cursor.close()
    conn.close()
    print("\n📡 Database connection closed")
