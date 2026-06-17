#!/usr/bin/env python3
"""
REAL Face Enrollment v3 - Better synthetic face generation
Uses more realistic face rendering that MTCNN can detect
"""

import requests
import json
import base64
import numpy as np
import cv2
import psycopg2
from datetime import datetime
import sys
from typing import Dict, List

FACE_AI_SERVICE_URL = "http://localhost:8000"
FACE_DB_HOST = "localhost"
FACE_DB_PORT = 5433
FACE_DB_NAME = "attendance_face_system"
FACE_DB_USER = "face_admin"
FACE_DB_PASSWORD = "securefacepassword123"

TEST_EMPLOYEES = [
    {"employee_id": "REAL_FACE_001", "seed": 12345},
    {"employee_id": "REAL_FACE_002", "seed": 54321},
    {"employee_id": "REAL_FACE_003", "seed": 99999},
]

def generate_realistic_face(seed: int = 42, size: int = 300) -> np.ndarray:
    """
    Generate a realistic-looking synthetic face using:
    - Gaussian skin tone gradients
    - Eye placement and shading
    - Nose and mouth features
    - Shadow and highlight effects
    """
    np.random.seed(seed)
    rng = np.random.RandomState(seed)
    
    img = np.zeros((size, size, 3), dtype=np.uint8)
    
    # Base skin tone (varies by person)
    skin_r = rng.randint(180, 220)
    skin_g = rng.randint(140, 180)
    skin_b = rng.randint(120, 160)
    
    # Create base face oval with gradient
    cy, cx = size // 2, size // 2
    face_w = size // 3
    face_h = size // 2.2
    
    # Draw face base
    Y, X = np.meshgrid(np.arange(size), np.arange(size), indexing='ij')
    # Ellipse equation
    face_mask = ((X - cx)**2 / (face_w**2) + (Y - cy)**2 / (face_h**2)) <= 1
    
    # Fill with gradient for 3D effect
    for i in range(size):
        for j in range(size):
            if face_mask[i, j]:
                # Lighting from top-left
                intensity = 1.0 - ((j - cx + 30)**2 + (i - cy - 40)**2) / (size**2)
                intensity = max(0.7, min(1.0, intensity))
                
                img[i, j, 0] = int(skin_r * intensity)
                img[i, j, 1] = int(skin_g * intensity)
                img[i, j, 2] = int(skin_b * intensity)
    
    # Add shadow on right side
    shadow_mask = (X > (cx + face_w * 0.3)) & face_mask
    img[shadow_mask] = (img[shadow_mask].astype(float) * 0.85).astype(np.uint8)
    
    # Eyes (critical for face detection)
    eye_left_x, eye_left_y = int(cx - face_w * 0.35), int(cy - face_h * 0.1)
    eye_right_x, eye_right_y = int(cx + face_w * 0.35), int(cy - face_h * 0.1)
    eye_size = 15
    
    # Left eye white
    cv2.circle(img, (eye_left_x, eye_left_y), eye_size, (255, 255, 255), -1)
    cv2.circle(img, (eye_right_x, eye_right_y), eye_size, (255, 255, 255), -1)
    
    # Left eye iris
    iris_size = 8
    iris_offset_x = rng.randint(-3, 3)
    iris_offset_y = rng.randint(-2, 2)
    cv2.circle(img, (eye_left_x + iris_offset_x, eye_left_y + iris_offset_y), 
               iris_size, (80, 60, 40), -1)
    cv2.circle(img, (eye_right_x + iris_offset_x, eye_right_y + iris_offset_y), 
               iris_size, (80, 60, 40), -1)
    
    # Pupil and shine
    cv2.circle(img, (eye_left_x + iris_offset_x, eye_left_y + iris_offset_y), 
               4, (20, 20, 20), -1)
    cv2.circle(img, (eye_right_x + iris_offset_x, eye_right_y + iris_offset_y), 
               4, (20, 20, 20), -1)
    
    # Eye shine
    cv2.circle(img, (eye_left_x + 5, eye_left_y - 3), 3, (255, 255, 255), -1)
    cv2.circle(img, (eye_right_x + 5, eye_right_y - 3), 3, (255, 255, 255), -1)
    
    # Eyebrows
    brow_y = int(eye_left_y - 15)
    pts_left = np.array([
        [eye_left_x - 12, brow_y],
        [eye_left_x + 10, brow_y - 3],
        [eye_left_x + 10, brow_y + 1]
    ], np.int32)
    cv2.fillPoly(img, [pts_left], (100, 70, 50))
    
    pts_right = np.array([
        [eye_right_x - 10, brow_y - 3],
        [eye_right_x + 12, brow_y],
        [eye_right_x + 12, brow_y + 1]
    ], np.int32)
    cv2.fillPoly(img, [pts_right], (100, 70, 50))
    
    # Nose
    nose_x, nose_y = int(cx), int(cy + face_h * 0.15)
    nose_h = int(face_h * 0.2)
    nose_w = 8
    
    # Nose bridge
    cv2.line(img, (nose_x, int(nose_y - nose_h * 0.5)), (nose_x, nose_y + nose_h), 
             (int(skin_r * 0.9), int(skin_g * 0.9), int(skin_b * 0.9)), 3)
    
    # Nose tip (triangle)
    pts_nose = np.array([
        [nose_x, nose_y + nose_h],
        [nose_x - nose_w, nose_y + nose_h + 10],
        [nose_x + nose_w, nose_y + nose_h + 10]
    ], np.int32)
    cv2.fillPoly(img, [pts_nose], (int(skin_r * 0.95), int(skin_g * 0.95), int(skin_b * 0.95)))
    
    # Mouth
    mouth_x, mouth_y = int(cx), int(cy + face_h * 0.35)
    mouth_w = int(face_w * 0.4)
    mouth_h = 12
    
    # Mouth outline
    cv2.ellipse(img, (mouth_x, mouth_y), (mouth_w, mouth_h), 0, 0, 180, 
                (120, 40, 50), 2)
    
    # Mouth fill (smile)
    pts_mouth = np.array([
        [mouth_x - mouth_w, mouth_y],
        [mouth_x + mouth_w, mouth_y],
        [mouth_x + mouth_w - 5, mouth_y + mouth_h - 3],
        [mouth_x - mouth_w + 5, mouth_y + mouth_h - 3]
    ], np.int32)
    cv2.fillPoly(img, [pts_mouth], (180, 80, 100))
    
    # Add some texture noise for realism
    noise = rng.normal(0, 5, img.shape).astype(np.float32)
    img_float = img.astype(np.float32) + noise
    img = np.clip(img_float, 0, 255).astype(np.uint8)
    
    # Slight blur for smoothness
    img = cv2.GaussianBlur(img, (3, 3), 0)
    
    return img

def image_to_base64(image: np.ndarray) -> str:
    """Convert image to base64."""
    success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise ValueError("Failed to encode")
    b64 = base64.b64encode(encoded).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def enroll_face_real_mode(employee_id: str, frames: List[str]) -> Dict:
    """Enroll through face-ai-service."""
    print(f"  [ENROLL] POST /api/register-face...")
    
    payload = {"employee_id": employee_id, "frames": frames}
    
    try:
        response = requests.post(
            f"{FACE_AI_SERVICE_URL}/api/register-face",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"    [ERROR] HTTP {response.status_code}")
            resp_text = response.text[:100]
            print(f"    {resp_text}")
            return {"success": False, "error": response.text}
        
        result = response.json()
        print(f"    [✓] Registered, embedding_dim={result.get('embedding_dim')}")
        return result
        
    except Exception as e:
        print(f"    [ERROR] {str(e)[:100]}")
        return {"success": False, "error": str(e)}

def store_embedding_in_db(employee_id: str, embedding: List[float], 
                          confidence: float, model_version: str) -> bool:
    """Store in database."""
    print(f"  [DB] Storing...")
    
    try:
        conn = psycopg2.connect(
            host=FACE_DB_HOST,
            port=FACE_DB_PORT,
            database=FACE_DB_NAME,
            user=FACE_DB_USER,
            password=FACE_DB_PASSWORD
        )
        
        cursor = conn.cursor()
        
        cursor.execute(
            "UPDATE face_embeddings SET is_active = FALSE WHERE employee_id = %s AND is_active = TRUE",
            (employee_id,)
        )
        
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
        cursor.close()
        conn.close()
        
        emb_np = np.array(embedding, dtype=np.float32)
        norm = np.linalg.norm(emb_np)
        print(f"    [✓] ID={embedding_id}, norm={norm:.4f}")
        
        return True
        
    except Exception as e:
        print(f"    [DB ERROR] {str(e)[:80]}")
        return False

def main():
    print("\n" + "="*80)
    print("REAL FACE ENROLLMENT - Phase 2 (Synthetic but Realistic)")
    print("="*80)
    print("\nGenerating realistic synthetic faces for MTCNN detection")
    print("Mode: REAL (FACE_RECOGNITION_MODE=real)")
    print("Algorithm: FaceNet 2.0 (512-dim L2-normalized)\n")
    
    results = []
    
    for emp in TEST_EMPLOYEES:
        employee_id = emp["employee_id"]
        seed = emp["seed"]
        
        print(f"\n{'-'*80}")
        print(f"ENROLLING: {employee_id}")
        print(f"{'-'*80}")
        
        try:
            # Generate faces
            print(f"\n[STEP 1] Generating realistic synthetic faces...")
            frames_b64 = []
            for i in range(3):
                # Vary seed slightly for each frame
                frame_seed = seed + i * 100
                img = generate_realistic_face(seed=frame_seed, size=300)
                b64 = image_to_base64(img)
                frames_b64.append(b64)
                print(f"    Frame {i+1}: generated")
            
            # Enroll
            print(f"\n[STEP 2] Enrolling through face-ai-service...")
            enroll_response = enroll_face_real_mode(employee_id, frames_b64)
            
            if not enroll_response.get("success"):
                print(f"  [FAILED] {enroll_response.get('error', 'Unknown error')[:80]}")
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            # Extract embedding
            print(f"\n[STEP 3] Processing embedding...")
            embedding = enroll_response.get("embedding")
            if not embedding:
                print(f"  [ERROR] No embedding")
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            embedding_np = np.array(embedding, dtype=np.float32)
            print(f"    Shape: {embedding_np.shape}")
            print(f"    Norm: {np.linalg.norm(embedding_np):.6f}")
            
            # Store
            print(f"\n[STEP 4] Storing in database...")
            if not store_embedding_in_db(employee_id, embedding, 0.85, "2.0-facenet-vggface2"):
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            print(f"\n[✓ SUCCESS] {employee_id} enrolled")
            results.append({
                "employee_id": employee_id,
                "status": "SUCCESS",
                "embedding_dim": len(embedding),
                "norm": float(np.linalg.norm(embedding_np))
            })
            
        except Exception as e:
            print(f"\n[EXCEPTION] {str(e)[:100]}")
            results.append({"employee_id": employee_id, "status": "FAILED"})
    
    # Summary
    print(f"\n\n" + "="*80)
    print("ENROLLMENT SUMMARY")
    print("="*80)
    
    successful = [r for r in results if r["status"] == "SUCCESS"]
    print(f"\nSuccessful: {len(successful)}/{len(results)}")
    for r in successful:
        print(f"  ✓ {r['employee_id']}")
    
    failed = [r for r in results if r["status"] != "SUCCESS"]
    if failed:
        print(f"\nFailed: {len(failed)}")
        for r in failed:
            print(f"  ✗ {r['employee_id']}")
    
    print(f"\n{'='*80}\n")
    
    with open("PHASE_2_ENROLLMENT_RESULTS.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "successful": len(successful),
            "total": len(results),
            "mode": "REAL",
            "results": results
        }, f, indent=2)
    
    return 0 if len(successful) == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
