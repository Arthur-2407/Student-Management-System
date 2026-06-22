#!/usr/bin/env python3
"""Inject test face embeddings for biometric testing"""

import psycopg2
import json

conn = psycopg2.connect(
    dbname='attendance_face_system',
    user='face_admin',
    password='securefacepassword123',
    host='localhost',
    port=5433
)
cursor = conn.cursor()

# Create test embedding vectors (128-dim FaceNet format)
# Note: Only ONE active embedding per student (database constraint)
# Multi-embedding means multiple in history, but one active
test_embeddings = [
    {'student_id': 125, 'vector': [0.35] + [0.0]*127, 'confidence': 0.95, 'version': '2.0-facenet-vggface2'},
]

print('[INJECTING TEST EMBEDDINGS]')
print('Target student: biotest001 (ID: 125)')
print('Embeddings to inject: 1 (database allows 1 active per student)')

# Clear existing
cursor.execute('DELETE FROM face_embeddings WHERE student_id = %s', (125,))
print('Cleared existing embeddings')

# Insert
for i, emb in enumerate(test_embeddings, 1):
    cursor.execute('''
    INSERT INTO face_embeddings
    (student_id, embedding_vector, embedding_version, confidence_score, is_active, enrolled_by, enrollment_date)
    VALUES (%s, %s, %s, %s, %s, %s, NOW())
    ''', (emb['student_id'], json.dumps(emb['vector']), emb['version'], emb['confidence'], True, 1))
    print(f'  Embedding {i}: confidence={emb["confidence"]}')

conn.commit()

# Verify
cursor.execute('''
SELECT COUNT(*) as count, AVG(confidence_score) as avg_confidence
FROM face_embeddings WHERE student_id = %s AND is_active = TRUE
''', (125,))

result = cursor.fetchone()
print('\nVerification:')
print(f'  Total active embeddings: {result[0]}')
print(f'  Average confidence: {result[1]:.2f}')

cursor.close()
conn.close()
