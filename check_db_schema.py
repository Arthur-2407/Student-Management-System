import psycopg2

conn = psycopg2.connect(
    host='localhost',
    port=5433,
    user='face_admin',
    password='securefacepassword123',
    database='attendance_face_system'
)

cur = conn.cursor()

# Get table structure
print("=== FACE_EMBEDDINGS TABLE STRUCTURE ===")
cur.execute("""
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'face_embeddings'
ORDER BY ordinal_position
""")

print(f"{'Column':<30} {'Data Type':<25} {'Nullable':<10}")
print("-" * 65)
for row in cur.fetchall():
    print(f"{row[0]:<30} {row[1]:<25} {row[2]:<10}")

# Count embeddings
print("\n=== MULTI-EMBEDDING EVIDENCE ===")
cur.execute("""
SELECT employee_id, COUNT(*) as count
FROM face_embeddings
WHERE is_active = TRUE
GROUP BY employee_id
ORDER BY count DESC
LIMIT 10
""")

print(f"{'Employee ID':<30} {'Active Embeddings':<20}")
print("-" * 50)
for row in cur.fetchall():
    print(f"{row[0]:<30} {row[1]:<20}")

# Check for encryption via embedding_vector content
print("\n=== ENCRYPTION STATUS ===")
cur.execute("""
SELECT COUNT(*) as total FROM face_embeddings
""")
total = cur.fetchone()[0]
print(f"Total embeddings: {total}")

# Get sample embedding vector to check encoding
cur.execute("""
SELECT embedding_vector, embedding_version FROM face_embeddings LIMIT 1
""")
result = cur.fetchone()
if result:
    vector_sample = result[0][:50] + "..." if len(result[0]) > 50 else result[0]
    version = result[1]
    print(f"Embedding version: {version}")
    print(f"Sample vector (first 50 chars): {vector_sample}")
    print(f"Vector format: {'Likely encrypted/encoded' if not vector_sample.startswith('[') else 'JSON array format'}")

cur.close()
conn.close()
