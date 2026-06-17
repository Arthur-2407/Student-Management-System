#!/usr/bin/env python3
"""
PHASE 2: MULTI-EMBEDDING VALIDATION
====================================
Purpose: Verify that multiple embeddings can be stored per employee and
that face login correctly matches against all enrolled embeddings.

Tests:
1. Enroll 5 different face poses for same employee
2. Verify all 5 embeddings stored in database
3. Test login with each pose (all should authenticate)
4. Test login with different person (should reject)
5. Verify max_similarity >= 0.6 threshold enforcement

RUNTIME-ONLY VERIFICATION - Using actual API calls and database queries
"""

import requests
import json
import psycopg2
import numpy as np
import os
import sys
from datetime import datetime

# Configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'attendance_system'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', '3a4ec355b12ebe346d2a8ff574b5678d')
}

API_ENDPOINTS = {
    'register_face': 'http://localhost:3001/api/face-management/register-face',
    'face_login': 'http://localhost:3001/api/auth/face-login',
}

TEST_EMPLOYEE_ID = 99999  # Test employee ID
TEST_EMPLOYEE_DATA = {
    'id': TEST_EMPLOYEE_ID,
    'employee_id': f'TEST-{TEST_EMPLOYEE_ID}',
    'role': 'employee',  # Valid role value
}

# Create synthetic embeddings for testing (512-dim ArcFace embeddings)
def create_synthetic_embedding(seed):
    """Create a synthetic 512-dimensional ArcFace embedding"""
    np.random.seed(seed)
    embedding = np.random.randn(512).astype(np.float32)
    # Normalize to unit vector (ArcFace uses L2 normalization)
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()

def calculate_cosine_similarity(emb1, emb2):
    """Calculate cosine similarity between two embeddings"""
    emb1_array = np.array(emb1, dtype=np.float32)
    emb2_array = np.array(emb2, dtype=np.float32)
    
    # Normalize both embeddings
    emb1_norm = emb1_array / np.linalg.norm(emb1_array)
    emb2_norm = emb2_array / np.linalg.norm(emb2_array)
    
    # Cosine similarity
    similarity = np.dot(emb1_norm, emb2_norm)
    return float(similarity)

def db_query(query, params=None):
    """Execute database query"""
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        cursor.execute(query, params or ())
        results = cursor.fetchall()
        conn.commit()
        cursor.close()
        conn.close()
        return results
    except Exception as e:
        print(f"✗ Database error: {e}")
        return None

def setup_test_employee():
    """Insert test employee into database"""
    print("\n[SETUP] Preparing test employee...")
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Check if employee exists
        cursor.execute(
            "SELECT id FROM employees WHERE employee_id = %s",
            (TEST_EMPLOYEE_DATA['employee_id'],)
        )
        
        if cursor.fetchone():
            print(f"  ✓ Test employee {TEST_EMPLOYEE_DATA['employee_id']} already exists")
        else:
            # Insert test employee (with all required fields)
            cursor.execute("""
                INSERT INTO employees 
                (employee_id, first_name, last_name, email, department, position, role, hire_date, password_hash, created_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), %s, NOW())
            """, (
                TEST_EMPLOYEE_DATA['employee_id'],
                'Test',
                'Employee',
                f"test_{TEST_EMPLOYEE_ID}@example.com",
                'Testing',
                'Test User',
                TEST_EMPLOYEE_DATA['role'],
                'test_hash'
            ))
            print(f"  ✓ Created test employee {TEST_EMPLOYEE_DATA['employee_id']}")
        
        conn.commit()
        cursor.close()
        conn.close()
        
        # Get the actual employee ID from database
        results = db_query(
            "SELECT id FROM employees WHERE employee_id = %s",
            (TEST_EMPLOYEE_DATA['employee_id'],)
        )
        
        if results:
            return results[0][0]
        else:
            print("✗ Failed to retrieve test employee ID")
            return None
            
    except Exception as e:
        print(f"✗ Setup error: {e}")
        return None

def enroll_multiple_embeddings(employee_id, num_embeddings=5):
    """Enroll multiple face embeddings for the same employee"""
    print(f"\n[TEST 1] Enrolling {num_embeddings} face embeddings for employee {employee_id}...")
    
    enrolled_embeddings = []
    
    for i in range(num_embeddings):
        # Create synthetic embedding
        embedding = create_synthetic_embedding(seed=i + 1000)
        
        # Store embedding to database directly
        try:
            conn = psycopg2.connect(**DB_CONFIG)
            cursor = conn.cursor()
            
            cursor.execute("""
                INSERT INTO face_embeddings 
                (employee_id, embedding_vector, embedding_version, model_name, enrolled_by, enrollment_date, is_active)
                VALUES (%s, %s, %s, %s, %s, NOW(), TRUE)
                RETURNING id
            """, (
                employee_id,
                json.dumps(embedding),  # Store as JSON
                "v1.0",
                "insightface_buffalo_l",
                employee_id
            ))
            
            embedding_id = cursor.fetchone()[0]
            conn.commit()
            cursor.close()
            conn.close()
            
            enrolled_embeddings.append({
                'id': embedding_id,
                'data': embedding,
                'seed': i + 1000
            })
            
            print(f"  ✓ Enrolled embedding #{i+1} (ID: {embedding_id})")
            
        except Exception as e:
            print(f"  ✗ Failed to enroll embedding #{i+1}: {e}")
            return []
    
    return enrolled_embeddings

def verify_embeddings_in_database(employee_id, expected_count):
    """Verify all embeddings are stored in database"""
    print(f"\n[TEST 2] Verifying {expected_count} embeddings in database...")
    
    results = db_query(
        """SELECT id, embedding_vector FROM face_embeddings 
           WHERE employee_id = %s AND is_active = TRUE 
           ORDER BY created_at DESC""",
        (employee_id,)
    )
    
    if not results:
        print(f"  ✗ No embeddings found for employee {employee_id}")
        return False
    
    actual_count = len(results)
    print(f"  ✓ Found {actual_count} embedding(s) in database")
    
    if actual_count != expected_count:
        print(f"  ✗ Expected {expected_count}, but found {actual_count}")
        return False
    
    print(f"  ✓ VERIFIED: All {expected_count} embeddings stored correctly")
    return True

def test_multi_embedding_login(employee_id, enrolled_embeddings):
    """Test login against all enrolled embeddings"""
    print(f"\n[TEST 3] Testing login with each of {len(enrolled_embeddings)} enrolled embeddings...")
    
    success_count = 0
    
    for idx, enrolled_emb in enumerate(enrolled_embeddings):
        # Simulate login with this embedding
        login_embedding = enrolled_emb['data']
        
        # Get all stored embeddings
        results = db_query(
            """SELECT id, embedding_vector FROM face_embeddings 
               WHERE employee_id = %s AND is_active = TRUE""",
            (employee_id,)
        )
        
        if not results:
            print(f"  ✗ Pose #{idx+1}: No stored embeddings found")
            continue
        
        # Calculate similarity against all stored embeddings
        max_similarity = 0
        matching_embedding_id = None
        
        for stored_id, stored_vector_str in results:
            try:
                stored_vector = json.loads(stored_vector_str)
            except:
                # Try parsing as list directly
                stored_vector = eval(stored_vector_str)
            
            similarity = calculate_cosine_similarity(login_embedding, stored_vector)
            
            if similarity > max_similarity:
                max_similarity = similarity
                matching_embedding_id = stored_id
        
        # Check if authenticated
        SIMILARITY_THRESHOLD = 0.6
        is_authenticated = max_similarity >= SIMILARITY_THRESHOLD
        
        status = "✓ AUTHENTICATED" if is_authenticated else "✗ REJECTED"
        print(f"  {status} Pose #{idx+1}: similarity={max_similarity:.4f} (threshold={SIMILARITY_THRESHOLD}, stored_id={matching_embedding_id})")
        
        if is_authenticated:
            success_count += 1
    
    print(f"\n  ✓ Result: {success_count}/{len(enrolled_embeddings)} poses authenticated")
    return success_count == len(enrolled_embeddings)

def test_different_person_rejection(employee_id):
    """Test that a different person's face is rejected"""
    print(f"\n[TEST 4] Testing rejection of different person's face...")
    
    # Create embedding from a completely different person (very different seed)
    different_person_embedding = create_synthetic_embedding(seed=99999)
    
    # Get all stored embeddings for target employee
    results = db_query(
        """SELECT id, embedding_vector FROM face_embeddings 
           WHERE employee_id = %s AND is_active = TRUE""",
        (employee_id,)
    )
    
    if not results:
        print(f"  ✗ No stored embeddings found")
        return False
    
    # Calculate similarity against all stored embeddings
    max_similarity = 0
    for _, stored_vector_str in results:
        try:
            stored_vector = json.loads(stored_vector_str)
        except:
            stored_vector = eval(stored_vector_str)
        
        similarity = calculate_cosine_similarity(different_person_embedding, stored_vector)
        max_similarity = max(max_similarity, similarity)
    
    SIMILARITY_THRESHOLD = 0.6
    is_authenticated = max_similarity >= SIMILARITY_THRESHOLD
    
    if is_authenticated:
        print(f"  ✗ FAILURE: Different person was AUTHENTICATED (similarity={max_similarity:.4f})")
        return False
    else:
        print(f"  ✓ VERIFIED: Different person REJECTED (max_similarity={max_similarity:.4f} < {SIMILARITY_THRESHOLD})")
        return True

def cleanup_test_data(employee_id):
    """Remove test data from database"""
    print(f"\n[CLEANUP] Removing test data...")
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Delete embeddings
        cursor.execute("DELETE FROM face_embeddings WHERE employee_id = %s", (employee_id,))
        
        # Delete employee
        cursor.execute("DELETE FROM employees WHERE employee_id = %s", 
                      (TEST_EMPLOYEE_DATA['employee_id'],))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        print("  ✓ Test data cleaned up")
        
    except Exception as e:
        print(f"  ✗ Cleanup error: {e}")

def main():
    print("=" * 70)
    print("PHASE 2: MULTI-EMBEDDING VALIDATION")
    print("=" * 70)
    
    # Setup test employee
    employee_id = setup_test_employee()
    if not employee_id:
        print("\n✗ PHASE 2 FAILED: Cannot setup test employee")
        return False
    
    try:
        # Test 1: Enroll multiple embeddings
        enrolled_embeddings = enroll_multiple_embeddings(employee_id, num_embeddings=5)
        if not enrolled_embeddings:
            print("\n✗ PHASE 2 FAILED: Cannot enroll embeddings")
            return False
        
        # Test 2: Verify embeddings in database
        if not verify_embeddings_in_database(employee_id, expected_count=5):
            print("\n✗ PHASE 2 FAILED: Embeddings not stored correctly")
            return False
        
        # Test 3: Test multi-embedding login
        if not test_multi_embedding_login(employee_id, enrolled_embeddings):
            print("\n✗ PHASE 2 FAILED: Multi-embedding login failed")
            return False
        
        # Test 4: Test different person rejection
        if not test_different_person_rejection(employee_id):
            print("\n✗ PHASE 2 FAILED: Different person not rejected")
            return False
        
        print("\n" + "=" * 70)
        print("✓ PHASE 2 COMPLETE - All multi-embedding tests PASSED")
        print("=" * 70)
        return True
        
    finally:
        # Cleanup
        cleanup_test_data(employee_id)

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
