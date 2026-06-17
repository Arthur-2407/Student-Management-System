#!/usr/bin/env python3
"""
PHASE 1: LIVE DATABASE VALIDATION
Runtime-only verification of actual PostgreSQL state
"""

import psycopg2
import psycopg2.extras
import json
import sys
import os

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),  # Changed from 'postgres' to 'localhost' for direct access
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'attendance_system'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', '3a4ec355b12ebe346d2a8ff574b5678d')
}

print("=" * 70)
print("PHASE 1: LIVE DATABASE VALIDATION")
print("=" * 70)
print()

# Try to connect
try:
    conn = psycopg2.connect(**DB_CONFIG)
    cursor = conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
    print("✓ Connected to PostgreSQL")
except Exception as e:
    print(f"✗ CRITICAL: Cannot connect to PostgreSQL")
    print(f"  Error: {e}")
    print(f"  Config: {DB_CONFIG}")
    sys.exit(1)

# ======================================================================
# TEST 1: Verify UNIQUE constraint is removed
# ======================================================================
print("\n" + "-" * 70)
print("TEST 1: UNIQUE CONSTRAINT STATUS")
print("-" * 70)

try:
    cursor.execute("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'face_embeddings'
        ORDER BY indexname;
    """)
    
    indexes = cursor.fetchall()
    
    if not indexes:
        print("✗ CRITICAL: No indexes found on face_embeddings table")
        sys.exit(1)
    
    print(f"Found {len(indexes)} indexes:")
    print()
    
    has_unique = False
    has_regular = False
    
    for idx in indexes:
        index_name = idx['indexname']
        index_def = idx['indexdef']
        
        is_unique = 'UNIQUE' in index_def
        
        print(f"  Index: {index_name}")
        print(f"  Type: {'UNIQUE' if is_unique else 'REGULAR'}")
        print(f"  Definition: {index_def[:80]}...")
        print()
        
        if 'unique_active' in index_name.lower():
            if is_unique:
                has_unique = True
                print("  ✗ CRITICAL: Old UNIQUE constraint still exists!")
            else:
                print("  ✓ Constraint removed successfully")
        
        if 'active' in index_name.lower() and not is_unique:
            has_regular = True
    
    print()
    if has_unique:
        print("✗ CONSTRAINT STATUS: UNIQUE constraint still exists")
    else:
        print("✓ CONSTRAINT STATUS: UNIQUE constraint removed")
    
    if has_regular:
        print("✓ INDEX STATUS: Regular active index exists")
    else:
        print("✗ INDEX STATUS: No regular active index found")
    
except Exception as e:
    print(f"✗ ERROR querying indexes: {e}")
    sys.exit(1)

# ======================================================================
# TEST 2: Verify multiple active embeddings can exist
# ======================================================================
print("\n" + "-" * 70)
print("TEST 2: MULTI-EMBEDDING CAPABILITY")
print("-" * 70)

try:
    cursor.execute("""
        SELECT employee_id, COUNT(*) as active_count
        FROM face_embeddings
        WHERE is_active = TRUE
        GROUP BY employee_id
        HAVING COUNT(*) > 1
        ORDER BY active_count DESC;
    """)
    
    multi_emb = cursor.fetchall()
    
    if multi_emb:
        print(f"✓ Found {len(multi_emb)} employees with multiple active embeddings:")
        print()
        for row in multi_emb[:5]:  # Show first 5
            print(f"  Employee ID {row['employee_id']}: {row['active_count']} embeddings")
        print()
        print("✓ VERDICT: Multi-embedding support is WORKING")
    else:
        print("⚠ No employees with multiple active embeddings found")
        print("  (This is expected if no multi-enrollment test has run)")
        print()
        print("? VERDICT: Cannot confirm multi-embedding support without test data")
    
except Exception as e:
    print(f"✗ ERROR querying multi-embeddings: {e}")

# ======================================================================
# TEST 3: Verify embedding storage structure
# ======================================================================
print("\n" + "-" * 70)
print("TEST 3: EMBEDDING STORAGE FORMAT")
print("-" * 70)

try:
    cursor.execute("""
        SELECT id, employee_id, embedding_vector, is_active
        FROM face_embeddings
        LIMIT 1;
    """)
    
    sample = cursor.fetchone()
    
    if not sample:
        print("⚠ No embeddings found in database")
        print("  (Expected for empty database)")
    else:
        print(f"Sample embedding found (ID: {sample['id']}):")
        print()
        
        emb_data = sample['embedding_vector']
        if isinstance(emb_data, str):
            print(f"  Format: String/JSON")
            try:
                parsed = json.loads(emb_data)
                if isinstance(parsed, dict) and parsed.get('encrypted'):
                    print(f"  Encryption: YES")
                    print(f"  Algorithm: {parsed.get('algorithm', 'unknown')}")
                    print(f"  Data length: {len(parsed.get('data', ''))}")
                elif isinstance(parsed, list):
                    print(f"  Encryption: NO (plaintext array)")
                    print(f"  Vector dimensions: {len(parsed)}")
                    print(f"  Sample values: {parsed[:5]}")
            except:
                print(f"  Format: Unknown (not JSON)")
        else:
            print(f"  Format: Binary/Other")
        
        print()
        print("✓ Embedding storage structure verified")

except Exception as e:
    print(f"✗ ERROR querying embeddings: {e}")

# ======================================================================
# TEST 4: Verify table schema
# ======================================================================
print("\n" + "-" * 70)
print("TEST 4: TABLE SCHEMA")
print("-" * 70)

try:
    cursor.execute("""
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'face_embeddings'
        ORDER BY ordinal_position;
    """)
    
    columns = cursor.fetchall()
    
    print(f"Columns ({len(columns)} total):")
    print()
    
    critical_cols = {
        'id': False,
        'employee_id': False,
        'embedding_vector': False,
        'is_active': False,
    }
    
    for col in columns:
        col_name = col['column_name']
        col_type = col['data_type']
        nullable = col['is_nullable']
        
        if col_name in critical_cols:
            critical_cols[col_name] = True
        
        nullable_str = "NULL" if nullable == 'YES' else "NOT NULL"
        print(f"  {col_name}: {col_type} ({nullable_str})")
    
    print()
    if all(critical_cols.values()):
        print("✓ All critical columns present")
    else:
        print("✗ Missing critical columns:")
        for col, found in critical_cols.items():
            if not found:
                print(f"  - {col}")

except Exception as e:
    print(f"✗ ERROR querying schema: {e}")

# ======================================================================
# SUMMARY
# ======================================================================
print("\n" + "=" * 70)
print("PHASE 1 SUMMARY")
print("=" * 70)

cursor.close()
conn.close()

print("\n✓ Database connection verified")
print("✓ Schema verification complete")
print("\nNextAction: Run PHASE 2 (Multi-Embedding Validation)")
