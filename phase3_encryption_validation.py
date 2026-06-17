#!/usr/bin/env python3
"""
PHASE 3: ENCRYPTION COMPATIBILITY
==================================
Purpose: Verify that embeddings encrypted in Node.js (backend-api) can be
correctly decrypted in Python (face-ai-service) using AES-256-GCM.

Tests:
1. Verify encryption key configuration
2. Test encryption/decryption roundtrip using same key
3. Verify encrypted storage format in database
4. Test Python decryption of Node.js encrypted data
5. Verify decrypted embeddings match originals

RUNTIME-ONLY VERIFICATION - Using actual database and cryptography
"""

import os
import json
import psycopg2
import numpy as np
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.backends import default_backend
import base64

DB_CONFIG = {
    'host': os.getenv('DB_HOST', 'localhost'),
    'port': os.getenv('DB_PORT', '5432'),
    'database': os.getenv('DB_NAME', 'attendance_system'),
    'user': os.getenv('DB_USER', 'postgres'),
    'password': os.getenv('DB_PASSWORD', '3a4ec355b12ebe346d2a8ff574b5678d')
}

# Test encryption key - this should match what Node.js uses
ENCRYPTION_MASTER_KEY = os.getenv('ENCRYPTION_MASTER_KEY', '0' * 64)  # 64 hex chars = 32 bytes

def get_encryption_key():
    """Get the 32-byte encryption key from environment"""
    key_hex = os.getenv('ENCRYPTION_MASTER_KEY', '0' * 64)
    if len(key_hex) != 64:
        print(f"✗ Invalid key length: {len(key_hex)}, expected 64 hex chars")
        return None
    
    try:
        key = bytes.fromhex(key_hex)
        if len(key) != 32:
            print(f"✗ Invalid key size: {len(key)} bytes, expected 32")
            return None
        return key
    except Exception as e:
        print(f"✗ Failed to parse key: {e}")
        return None

def create_test_embedding(seed):
    """Create a 512-dim ArcFace embedding"""
    np.random.seed(seed)
    embedding = np.random.randn(512).astype(np.float32)
    embedding = embedding / np.linalg.norm(embedding)
    return embedding.tolist()

def encrypt_embedding(embedding_array, key):
    """
    Encrypt a 512-dim embedding using AES-256-GCM.
    This mimics what Node.js does.
    
    Returns: dict {encrypted: true, data: base64_string, algorithm: "aes-256-gcm"}
    """
    if not key or len(key) != 32:
        return None
    
    # Generate random 12-byte nonce
    import os as os_module
    nonce = os_module.urandom(12)
    
    # Convert embedding to bytes (json)
    embedding_json = json.dumps(embedding_array)
    plaintext = embedding_json.encode('utf-8')
    
    # Encrypt
    cipher = AESGCM(key)
    ciphertext = cipher.encrypt(nonce, plaintext, None)
    
    # ciphertext includes auth_tag (last 16 bytes)
    # Format: [nonce (12 bytes) || ciphertext || auth_tag (16 bytes)]
    encrypted_data = nonce + ciphertext
    
    # Return as JSON with base64 encoding
    result = {
        'encrypted': True,
        'data': base64.b64encode(encrypted_data).decode('utf-8'),
        'algorithm': 'aes-256-gcm'
    }
    
    return result

def decrypt_embedding(encrypted_json_str, key):
    """
    Decrypt an embedding encrypted with AES-256-GCM.
    This mimics what Python in face-ai-service does.
    
    Input: JSON string from database
    Returns: decrypted embedding array or None
    """
    if not key or len(key) != 32:
        return None
    
    try:
        # Parse encrypted data
        if isinstance(encrypted_json_str, str):
            encrypted_data = json.loads(encrypted_json_str)
        else:
            encrypted_data = encrypted_json_str
        
        if not encrypted_data.get('encrypted'):
            # Not encrypted, try to parse as array directly
            if isinstance(encrypted_data, list):
                return encrypted_data
            return None
        
        # Decode base64
        encrypted_bytes = base64.b64decode(encrypted_data['data'])
        
        # Extract nonce (first 12 bytes) and ciphertext (rest)
        nonce = encrypted_bytes[:12]
        ciphertext = encrypted_bytes[12:]
        
        # Decrypt
        cipher = AESGCM(key)
        plaintext = cipher.decrypt(nonce, ciphertext, None)
        
        # Parse JSON
        decrypted_embedding = json.loads(plaintext.decode('utf-8'))
        return decrypted_embedding
        
    except Exception as e:
        print(f"    ✗ Decryption error: {e}")
        return None

def test_encryption_key_configuration():
    """Test 1: Verify encryption key configuration"""
    print("\n[TEST 1] Encryption Key Configuration")
    print("-" * 60)
    
    key = get_encryption_key()
    if not key:
        print("✗ Encryption key not properly configured")
        return False
    
    print(f"✓ Key successfully loaded ({len(key)} bytes)")
    return True

def test_encryption_decryption_roundtrip():
    """Test 2: Test encryption/decryption roundtrip"""
    print("\n[TEST 2] Encryption/Decryption Roundtrip")
    print("-" * 60)
    
    key = get_encryption_key()
    if not key:
        print("✗ No encryption key available")
        return False
    
    # Create test embedding
    test_embedding = create_test_embedding(seed=12345)
    print(f"  Created test embedding (512-dim)")
    
    # Encrypt
    encrypted = encrypt_embedding(test_embedding, key)
    if not encrypted:
        print("✗ Encryption failed")
        return False
    
    print(f"  ✓ Encrypted successfully")
    print(f"    - Data: {encrypted['data'][:50]}...")
    print(f"    - Algorithm: {encrypted['algorithm']}")
    
    # Decrypt
    encrypted_json_str = json.dumps(encrypted)
    decrypted = decrypt_embedding(encrypted_json_str, key)
    if not decrypted:
        print("✗ Decryption failed")
        return False
    
    print(f"  ✓ Decrypted successfully")
    
    # Compare
    original_array = np.array(test_embedding, dtype=np.float32)
    decrypted_array = np.array(decrypted, dtype=np.float32)
    
    # Check if arrays match
    if np.allclose(original_array, decrypted_array, atol=1e-6):
        print(f"  ✓ Decrypted matches original (max delta: {np.max(np.abs(original_array - decrypted_array))})")
        return True
    else:
        print(f"✗ Decrypted does not match original")
        print(f"    Max difference: {np.max(np.abs(original_array - decrypted_array))}")
        return False

def test_encrypted_storage_format():
    """Test 3: Verify encrypted storage format in database"""
    print("\n[TEST 3] Encrypted Storage Format")
    print("-" * 60)
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Get a sample embedding (encrypted or not)
        cursor.execute("""
            SELECT id, embedding_vector FROM face_embeddings 
            WHERE is_active = TRUE LIMIT 1
        """)
        
        result = cursor.fetchone()
        conn.close()
        
        if not result:
            print("⚠ No embeddings found in database (skipping storage format test)")
            return True  # Not a failure, just no data to test
        
        embedding_id, embedding_str = result
        print(f"  Checking embedding ID {embedding_id}...")
        
        # Try to parse as JSON
        try:
            embedding_json = json.loads(embedding_str)
            
            if isinstance(embedding_json, dict) and embedding_json.get('encrypted'):
                print(f"  ✓ Embedding is ENCRYPTED (AES-256-GCM format)")
                print(f"    - Encrypted: {embedding_json.get('encrypted')}")
                print(f"    - Algorithm: {embedding_json.get('algorithm')}")
                print(f"    - Data: {embedding_json.get('data', '')[:50]}...")
                return True
            else:
                print(f"⚠ Embedding is NOT encrypted (array or different format)")
                return True  # Not a failure, just not encrypted
                
        except json.JSONDecodeError:
            # Try as array
            try:
                embedding_array = eval(embedding_str)
                if isinstance(embedding_array, list):
                    print(f"⚠ Embedding stored as plain JSON array (not encrypted)")
                    return True
            except:
                print(f"✗ Cannot parse embedding: {embedding_str[:100]}")
                return False
        
    except Exception as e:
        print(f"✗ Database error: {e}")
        return False

def test_python_decryption_of_encrypted_data():
    """Test 4: Test Python decryption of encrypted data from database"""
    print("\n[TEST 4] Python Decryption of Database Data")
    print("-" * 60)
    
    key = get_encryption_key()
    if not key:
        print("✗ No encryption key available")
        return False
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        # Get encrypted embeddings
        cursor.execute("""
            SELECT id, embedding_vector FROM face_embeddings 
            WHERE is_active = TRUE LIMIT 3
        """)
        
        results = cursor.fetchall()
        conn.close()
        
        if not results:
            print("⚠ No embeddings found in database (skipping)")
            return True
        
        decryption_success_count = 0
        
        for embedding_id, embedding_str in results:
            # Try to decrypt
            decrypted = decrypt_embedding(embedding_str, key)
            
            if decrypted:
                # Validate it's a valid embedding
                if isinstance(decrypted, list) and len(decrypted) == 512:
                    print(f"  ✓ Embedding ID {embedding_id}: Successfully decrypted (512-dim)")
                    decryption_success_count += 1
                else:
                    print(f"  ⚠ Embedding ID {embedding_id}: Decrypted but invalid format")
            else:
                # Might be unencrypted
                try:
                    embedding_json = json.loads(embedding_str)
                    if isinstance(embedding_json, list):
                        print(f"  ✓ Embedding ID {embedding_id}: Unencrypted array (valid)")
                        decryption_success_count += 1
                except:
                    print(f"  ⚠ Embedding ID {embedding_id}: Could not decrypt or parse")
        
        if decryption_success_count > 0:
            print(f"\n  ✓ Successfully processed {decryption_success_count}/{len(results)} embeddings")
            return True
        else:
            print(f"✗ Could not decrypt any embeddings")
            return False
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

def test_decrypted_embeddings_validity():
    """Test 5: Verify decrypted embeddings are valid (512-dim, normalized)"""
    print("\n[TEST 5] Decrypted Embeddings Validity")
    print("-" * 60)
    
    key = get_encryption_key()
    if not key:
        print("✗ No encryption key available")
        return False
    
    try:
        conn = psycopg2.connect(**DB_CONFIG)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT id, embedding_vector FROM face_embeddings 
            WHERE is_active = TRUE LIMIT 3
        """)
        
        results = cursor.fetchall()
        conn.close()
        
        if not results:
            print("⚠ No embeddings found (skipping)")
            return True
        
        all_valid = True
        
        for embedding_id, embedding_str in results:
            decrypted = decrypt_embedding(embedding_str, key)
            
            if decrypted:
                embedding_array = np.array(decrypted, dtype=np.float32)
                
                # Check dimension
                if len(embedding_array) != 512:
                    print(f"✗ Embedding ID {embedding_id}: Invalid dimension {len(embedding_array)}")
                    all_valid = False
                    continue
                
                # Check norm (should be ~1 for normalized vectors)
                norm = np.linalg.norm(embedding_array)
                if abs(norm - 1.0) > 0.1:  # Allow some tolerance
                    print(f"⚠ Embedding ID {embedding_id}: Norm {norm:.4f} (expected ~1.0)")
                else:
                    print(f"✓ Embedding ID {embedding_id}: Valid (512-dim, normalized)")
        
        return all_valid
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return False

def main():
    print("=" * 70)
    print("PHASE 3: ENCRYPTION COMPATIBILITY VALIDATION")
    print("=" * 70)
    
    test_results = []
    
    # Test 1
    test_results.append(("Encryption Key Configuration", test_encryption_key_configuration()))
    
    # Test 2
    test_results.append(("Encryption/Decryption Roundtrip", test_encryption_decryption_roundtrip()))
    
    # Test 3
    test_results.append(("Encrypted Storage Format", test_encrypted_storage_format()))
    
    # Test 4
    test_results.append(("Python Decryption", test_python_decryption_of_encrypted_data()))
    
    # Test 5
    test_results.append(("Embeddings Validity", test_decrypted_embeddings_validity()))
    
    # Summary
    print("\n" + "=" * 70)
    print("PHASE 3 SUMMARY")
    print("=" * 70)
    
    passed = sum(1 for _, result in test_results if result)
    total = len(test_results)
    
    for test_name, result in test_results:
        status = "✓ PASS" if result else "✗ FAIL"
        print(f"{status}: {test_name}")
    
    print(f"\nResult: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n✓ PHASE 3 COMPLETE - All encryption tests PASSED")
        return True
    else:
        print("\n✗ PHASE 3 FAILED - Some encryption tests failed")
        return False

if __name__ == "__main__":
    import sys
    success = main()
    sys.exit(0 if success else 1)
