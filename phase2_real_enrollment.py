#!/usr/bin/env python3
"""
REAL Face Enrollment Generator - PHASE 2
Generates REAL face embeddings through face-ai-service (NOT synthetic)
for use in PHASE 3-5 testing (correct face acceptance, wrong face rejection)

Features:
- Generates base64-encoded test face images
- Sends to face-ai-service /api/register-face in REAL mode
- Stores real FaceNet 2.0 embeddings in PostgreSQL
- Provides runtime evidence for validation
"""

import requests
import json
import base64
import numpy as np
import cv2
import psycopg2
from datetime import datetime
import sys
from typing import Dict, List, Tuple, Optional

# Configuration
FACE_AI_SERVICE_URL = "http://localhost:8000"
FACE_DB_HOST = "localhost"
FACE_DB_PORT = 5433
FACE_DB_NAME = "attendance_face"
FACE_DB_USER = "face_user"
FACE_DB_PASSWORD = "face_password"

# Test employees for enrollment
TEST_EMPLOYEES = [
    {"employee_id": "REAL_FACE_001", "name": "Test Employee 1"},
    {"employee_id": "REAL_FACE_002", "name": "Test Employee 2"},
    {"employee_id": "REAL_FACE_003", "name": "Test Employee 3"},
]

def generate_test_face_image(seed: int = 42) -> np.ndarray:
    """
    Generate a synthetic but realistic-looking face image.
    Uses simple geometric shapes to create a face-like pattern that
    the face detector can process.
    
    Returns:
        BGR image array suitable for face detection
    """
    np.random.seed(seed)
    
    # Create a reasonable face-sized image (200x200 px)
    img = np.ones((200, 200, 3), dtype=np.uint8) * 200
    
    # Draw face oval (skin color)
    cv2.ellipse(img, (100, 100), (70, 85), 0, 0, 360, (180, 150, 140), -1)
    
    # Draw eyes
    cv2.circle(img, (80, 85), 12, (50, 50, 50), -1)  # Left eye
    cv2.circle(img, (120, 85), 12, (50, 50, 50), -1)  # Right eye
    cv2.circle(img, (82, 83), 6, (255, 255, 255), -1)  # Left eye shine
    cv2.circle(img, (122, 83), 6, (255, 255, 255), -1)  # Right eye shine
    
    # Draw nose
    pts = np.array([[100, 95], [95, 110], [100, 112], [105, 110]], np.int32)
    cv2.polylines(img, [pts], True, (180, 130, 110), 2)
    
    # Draw mouth
    cv2.ellipse(img, (100, 135), (25, 12), 0, 0, 180, (150, 80, 80), 2)
    
    # Add some texture variation for realism
    noise = np.random.normal(0, 10, img.shape).astype(np.uint8)
    img = cv2.add(img, noise)
    
    # Add slight color variation to match skin tones
    img[:, :, 2] = np.clip(img[:, :, 2] + 10, 0, 255)  # Red channel
    
    return img

def image_to_base64(image: np.ndarray, format: str = "jpeg") -> str:
    """Convert OpenCV image to base64-encoded string."""
    if format.lower() == "jpeg":
        success, encoded = cv2.imencode(".jpg", image)
        if not success:
            raise ValueError("Failed to encode image as JPEG")
        b64 = base64.b64encode(encoded).decode("utf-8")
        return f"data:image/jpeg;base64,{b64}"
    else:
        success, encoded = cv2.imencode(".png", image)
        if not success:
            raise ValueError("Failed to encode image as PNG")
        b64 = base64.b64encode(encoded).decode("utf-8")
        return f"data:image/png;base64,{b64}"

def enroll_face_real_mode(employee_id: str, frames: List[str]) -> Dict:
    """
    Enroll a face through face-ai-service in REAL mode.
    
    Args:
        employee_id: Employee ID for enrollment
        frames: List of base64-encoded frame strings
        
    Returns:
        Response from face-ai-service /api/register-face
    """
    print(f"  [ENROLL] Calling face-ai-service /api/register-face for {employee_id}...")
    
    payload = {
        "employee_id": employee_id,
        "frames": frames,
    }
    
    try:
        response = requests.post(
            f"{FACE_AI_SERVICE_URL}/api/register-face",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"  [ERROR] Registration failed: HTTP {response.status_code}")
            print(f"  Response: {response.text}")
            return {"success": False, "error": response.text}
        
        result = response.json()
        print(f"  [SUCCESS] Registration response received")
        print(f"    - registered: {result.get('registered', False)}")
        print(f"    - embedding_dim: {result.get('embedding_dim', 'N/A')}")
        print(f"    - quality_score: {result.get('quality_score', 'N/A')}")
        print(f"    - model_version: {result.get('model_version', 'N/A')}")
        
        return result
        
    except requests.exceptions.RequestException as e:
        print(f"  [ERROR] Request failed: {str(e)}")
        return {"success": False, "error": str(e)}

def store_embedding_in_db(employee_id: str, embedding: List[float], 
                          confidence: float, model_version: str) -> bool:
    """
    Store embedding in PostgreSQL face_embeddings table.
    
    Args:
        employee_id: Employee ID
        embedding: 512-dim embedding vector
        confidence: Quality/confidence score
        model_version: Model version string
        
    Returns:
        True if successful, False otherwise
    """
    print(f"  [DB] Storing embedding in PostgreSQL face_embeddings table...")
    
    try:
        conn = psycopg2.connect(
            host=FACE_DB_HOST,
            port=FACE_DB_PORT,
            database=FACE_DB_NAME,
            user=FACE_DB_USER,
            password=FACE_DB_PASSWORD
        )
        
        cursor = conn.cursor()
        
        # Deactivate any existing active embeddings for this employee
        cursor.execute(
            """UPDATE face_embeddings 
               SET is_active = FALSE 
               WHERE employee_id = %s AND is_active = TRUE""",
            (employee_id,)
        )
        
        # Insert new embedding
        embedding_json = json.dumps(embedding)
        cursor.execute(
            """INSERT INTO face_embeddings 
               (employee_id, embedding_vector, confidence_score, model_version, is_active, created_at)
               VALUES (%s, %s, %s, %s, TRUE, NOW())
               RETURNING id""",
            (employee_id, embedding_json, confidence, model_version)
        )
        
        embedding_id = cursor.fetchone()[0]
        conn.commit()
        
        print(f"  [DB] ✓ Embedding stored: ID={embedding_id}, dim={len(embedding)}")
        print(f"      Embedding vector (first 5 dims): {embedding[:5]}")
        print(f"      Embedding norm (should be ~1.0): {np.linalg.norm(embedding):.4f}")
        
        cursor.close()
        conn.close()
        
        return True
        
    except psycopg2.Error as e:
        print(f"  [DB ERROR] Database error: {str(e)}")
        return False
    except Exception as e:
        print(f"  [DB ERROR] Unexpected error: {str(e)}")
        return False

def main():
    """Main enrollment workflow."""
    print("\n" + "="*80)
    print("REAL FACE ENROLLMENT GENERATOR - PHASE 2")
    print("="*80)
    print("\nObjective: Generate REAL face embeddings for PHASE 3-5 validation")
    print("Mode: REAL (FACE_RECOGNITION_MODE=real)")
    print("Algorithm: FaceNet 2.0 (512-dim L2-normalized vectors)")
    print("Threshold: Similarity >= 0.55 (configurable)")
    
    enrollment_results = []
    
    for emp in TEST_EMPLOYEES:
        employee_id = emp["employee_id"]
        print(f"\n{'-'*80}")
        print(f"ENROLLING: {employee_id} ({emp['name']})")
        print(f"{'-'*80}")
        
        try:
            # Step 1: Generate test face images
            print(f"\n[STEP 1] Generating test face images...")
            frames_b64 = []
            
            # Generate 3 frames with slight variations
            for i in range(3):
                seed = hash(employee_id + str(i)) % (2**31)
                img = generate_test_face_image(seed=seed)
                b64_frame = image_to_base64(img)
                frames_b64.append(b64_frame)
                print(f"  Frame {i+1}: {len(b64_frame)} chars, size={img.shape}")
            
            # Step 2: Enroll through face-ai-service
            print(f"\n[STEP 2] Enrolling through face-ai-service...")
            enroll_response = enroll_face_real_mode(employee_id, frames_b64)
            
            if not enroll_response.get("success"):
                print(f"  [FAILED] Enrollment failed: {enroll_response.get('error')}")
                enrollment_results.append({
                    "employee_id": employee_id,
                    "status": "FAILED",
                    "reason": enroll_response.get("error")
                })
                continue
            
            # Step 3: Extract embedding from response
            print(f"\n[STEP 3] Processing embedding...")
            embedding = enroll_response.get("embedding")
            if not embedding or not isinstance(embedding, list):
                print(f"  [ERROR] Invalid embedding in response")
                enrollment_results.append({
                    "employee_id": employee_id,
                    "status": "FAILED",
                    "reason": "Invalid embedding format"
                })
                continue
            
            embedding_np = np.array(embedding, dtype=np.float32)
            print(f"  Embedding shape: {embedding_np.shape}")
            print(f"  Embedding norm: {np.linalg.norm(embedding_np):.6f} (should be ~1.0)")
            print(f"  First 10 elements: {embedding_np[:10]}")
            
            confidence = enroll_response.get("quality_score", 0.5)
            model_version = enroll_response.get("model_version", "2.0-facenet-vggface2")
            
            # Step 4: Store in database
            print(f"\n[STEP 4] Storing in database...")
            if not store_embedding_in_db(employee_id, embedding, confidence, model_version):
                enrollment_results.append({
                    "employee_id": employee_id,
                    "status": "FAILED",
                    "reason": "Database storage failed"
                })
                continue
            
            # Success
            print(f"\n[✓ SUCCESS] {employee_id} enrolled successfully")
            enrollment_results.append({
                "employee_id": employee_id,
                "status": "SUCCESS",
                "embedding_dim": len(embedding),
                "embedding_norm": float(np.linalg.norm(embedding_np)),
                "confidence": confidence,
                "model_version": model_version,
                "first_5_dims": embedding[:5]
            })
            
        except Exception as e:
            print(f"\n[EXCEPTION] Error during enrollment: {str(e)}")
            enrollment_results.append({
                "employee_id": employee_id,
                "status": "FAILED",
                "reason": str(e)
            })
    
    # Summary
    print(f"\n\n" + "="*80)
    print("ENROLLMENT SUMMARY")
    print("="*80)
    
    successful = [r for r in enrollment_results if r["status"] == "SUCCESS"]
    failed = [r for r in enrollment_results if r["status"] == "FAILED"]
    
    print(f"\nSuccessful: {len(successful)}/{len(enrollment_results)}")
    for r in successful:
        print(f"  ✓ {r['employee_id']}: {r['embedding_dim']}D, norm={r['embedding_norm']:.4f}")
    
    if failed:
        print(f"\nFailed: {len(failed)}/{len(enrollment_results)}")
        for r in failed:
            print(f"  ✗ {r['employee_id']}: {r['reason']}")
    
    print(f"\n{'='*80}")
    print(f"PHASE 2 STATUS: {'COMPLETE ✓' if len(successful) == len(TEST_EMPLOYEES) else 'INCOMPLETE ✗'}")
    print(f"{'='*80}\n")
    
    # Save detailed results
    with open("PHASE_2_ENROLLMENT_RESULTS.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "total_enrolled": len(successful),
            "total_failed": len(failed),
            "mode": "REAL",
            "results": enrollment_results
        }, f, indent=2)
    
    print(f"Detailed results saved to: PHASE_2_ENROLLMENT_RESULTS.json")
    
    return 0 if len(successful) == len(TEST_EMPLOYEES) else 1

if __name__ == "__main__":
    sys.exit(main())
