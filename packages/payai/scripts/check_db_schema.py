#!/usr/bin/env python3
"""Check database schema to find the correct table names"""
import sys
import psycopg2

database_url = sys.argv[1]
conn = psycopg2.connect(database_url)
cursor = conn.cursor()

print("📋 Tables in database:\n")
cursor.execute("""
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
""")
tables = cursor.fetchall()
for table in tables:
    print(f"  - {table[0]}")

print("\n🔍 Looking for user/subscription related tables...")
for table in tables:
    table_name = table[0]
    if 'user' in table_name.lower() or 'subscription' in table_name.lower():
        print(f"\n📊 Columns in {table_name}:")
        cursor.execute(f"""
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_name = '{table_name}'
            ORDER BY ordinal_position
        """)
        columns = cursor.fetchall()
        for col in columns:
            print(f"  - {col[0]} ({col[1]})")

cursor.close()
conn.close()
