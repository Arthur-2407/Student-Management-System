#!/usr/bin/env python3
"""
REAL Face Enrollment v5 - Uses Docker exec for database access
"""

import requests
import json
import base64
import numpy as np
import cv2
import subprocess
from datetime import datetime
import sys
from typing import Dict, List

FACE_AI_SERVICE_URL = "http://localhost:8000"

TEST_EMPLOYEES = [
    {"employee_id": "REAL_FACE_001", "name": "Real Face Test User 1", "seed": 12345},
    {"employee_id": "REAL_FACE_002", "name": "Real Face Test User 2", "seed": 54321},
    {"employee_id": "REAL_FACE_003", "name": "Real Face Test User 3", "seed": 99999},
]

def generate_realistic_face(seed: int = 42, size: int = 300) -> np.ndarray:
    """Generate realistic synthetic face."""
    np.random.seed(seed)
    rng = np.random.RandomState(seed)
    
    img = np.zeros((size, size, 3), dtype=np.uint8)
    cy, cx = size // 2, size // 2
    face_w = size // 3
    face_h = size // 2.2
    
    skin_r = rng.randint(180, 220)
    skin_g = rng.randint(140, 180)
    skin_b = rng.randint(120, 160)
    
    Y, X = np.meshgrid(np.arange(size), np.arange(size), indexing='ij')
    face_mask = ((X - cx)**2 / (face_w**2) + (Y - cy)**2 / (face_h**2)) <= 1
    
    for i in range(size):
        for j in range(size):
            if face_mask[i, j]:
                intensity = 1.0 - ((j - cx + 30)**2 + (i - cy - 40)**2) / (size**2)
                intensity = max(0.7, min(1.0, intensity))
                img[i, j, 0] = int(skin_r * intensity)
                img[i, j, 1] = int(skin_g * intensity)
                img[i, j, 2] = int(skin_b * intensity)
    
    shadow_mask = (X > (cx + face_w * 0.3)) & face_mask
    img[shadow_mask] = (img[shadow_mask].astype(float) * 0.85).astype(np.uint8)
    
    eye_left_x, eye_left_y = int(cx - face_w * 0.35), int(cy - face_h * 0.1)
    eye_right_x, eye_right_y = int(cx + face_w * 0.35), int(cy - face_h * 0.1)
    eye_size = 15
    
    cv2.circle(img, (eye_left_x, eye_left_y), eye_size, (255, 255, 255), -1)
    cv2.circle(img, (eye_right_x, eye_right_y), eye_size, (255, 255, 255), -1)
    
    iris_size = 8
    iris_offset_x = rng.randint(-3, 3)
    iris_offset_y = rng.randint(-2, 2)
    cv2.circle(img, (eye_left_x + iris_offset_x, eye_left_y + iris_offset_y), iris_size, (80, 60, 40), -1)
    cv2.circle(img, (eye_right_x + iris_offset_x, eye_right_y + iris_offset_y), iris_size, (80, 60, 40), -1)
    
    cv2.circle(img, (eye_left_x + iris_offset_x, eye_left_y + iris_offset_y), 4, (20, 20, 20), -1)
    cv2.circle(img, (eye_right_x + iris_offset_x, eye_right_y + iris_offset_y), 4, (20, 20, 20), -1)
    
    cv2.circle(img, (eye_left_x + 5, eye_left_y - 3), 3, (255, 255, 255), -1)
    cv2.circle(img, (eye_right_x + 5, eye_right_y - 3), 3, (255, 255, 255), -1)
    
    brow_y = int(eye_left_y - 15)
    pts_left = np.array([[eye_left_x - 12, brow_y], [eye_left_x + 10, brow_y - 3], [eye_left_x + 10, brow_y + 1]], np.int32)
    cv2.fillPoly(img, [pts_left], (100, 70, 50))
    pts_right = np.array([[eye_right_x - 10, brow_y - 3], [eye_right_x + 12, brow_y], [eye_right_x + 12, brow_y + 1]], np.int32)
    cv2.fillPoly(img, [pts_right], (100, 70, 50))
    
    nose_x, nose_y = int(cx), int(cy + face_h * 0.15)
    nose_h = int(face_h * 0.2)
    nose_w = 8
    cv2.line(img, (nose_x, int(nose_y - nose_h * 0.5)), (nose_x, nose_y + nose_h), 
             (int(skin_r * 0.9), int(skin_g * 0.9), int(skin_b * 0.9)), 3)
    pts_nose = np.array([[nose_x, nose_y + nose_h], [nose_x - nose_w, nose_y + nose_h + 10], [nose_x + nose_w, nose_y + nose_h + 10]], np.int32)
    cv2.fillPoly(img, [pts_nose], (int(skin_r * 0.95), int(skin_g * 0.95), int(skin_b * 0.95)))
    
    mouth_x, mouth_y = int(cx), int(cy + face_h * 0.35)
    mouth_w = int(face_w * 0.4)
    mouth_h = 12
    cv2.ellipse(img, (mouth_x, mouth_y), (mouth_w, mouth_h), 0, 0, 180, (120, 40, 50), 2)
    pts_mouth = np.array([[mouth_x - mouth_w, mouth_y], [mouth_x + mouth_w, mouth_y], [mouth_x + mouth_w - 5, mouth_y + mouth_h - 3], [mouth_x - mouth_w + 5, mouth_y + mouth_h - 3]], np.int32)
    cv2.fillPoly(img, [pts_mouth], (180, 80, 100))
    
    noise = rng.normal(0, 5, img.shape).astype(np.float32)
    img_float = img.astype(np.float32) + noise
    img = np.clip(img_float, 0, 255).astype(np.uint8)
    img = cv2.GaussianBlur(img, (3, 3), 0)
    
    return img

def image_to_base64(image: np.ndarray) -> str:
    """Convert image to base64."""
    success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 95])
    if not success:
        raise ValueError("Failed to encode")
    b64 = base64.b64encode(encoded).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def create_test_employee_docker(employee_id: str, name: str) -> int:
    """Create test employee using docker exec."""
    print(f"    Creating employee {employee_id}...")
    
    try:
        names = name.split()
        first_name = names[0]
        last_name = " ".join(names[1:]) if len(names) > 1 else "User"
        
        # Check if exists
        result = subprocess.run(
            ["docker", "exec", "attendance-db", "psql", "-U", "postgres", "-d", "attendance_system", "-tAc", f"SELECT id FROM employees WHERE employee_id = '{employee_id}';"], 
            capture_output=True, text=True, timeout=10
        )
        if result.stdout.strip():
            emp_id = int(result.stdout.strip())
            print(f"      Already exists, ID={emp_id}")
            return emp_id
        
        # Insert new employee
        result = subprocess.run(
            ["docker", "exec", "attendance-db", "psql", "-U", "postgres", "-d", "attendance_system", "-tAc", f"INSERT INTO employees (employee_id, first_name, last_name, email, department, position, role, hire_date, is_active) VALUES ('{employee_id}', '{first_name}', '{last_name}', '{employee_id}@test.local', 'Test', 'Test User', 'employee', NOW(), TRUE) RETURNING id;"], 
            capture_output=True, text=True, timeout=10
        )
        if result.returncode != 0:
            print(f"      ERROR: {result.stderr[:80]}")
            return None
        
        emp_id = int(result.stdout.strip())
        print(f"      Created, ID={emp_id}")
        return emp_id
        
    except Exception as e:
        print(f"      ERROR: {str(e)[:80]}")
        return None

def enroll_face_real_mode(employee_id: str, frames: List[str]) -> Dict:
    """Enroll through face-ai-service."""
    payload = {"employee_id": employee_id, "frames": frames}
    
    try:
        response = requests.post(
            f"{FACE_AI_SERVICE_URL}/api/register-face",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            return {"success": False, "error": response.text[:80]}
        
        return response.json()
        
    except Exception as e:
        return {"success": False, "error": str(e)[:80]}

def store_embedding_docker(emp_db_id: int, embedding: List[float], confidence: float, model_version: str) -> bool:
    """Store embedding using docker exec."""
    try:
        # Deactivate existing
        subprocess.run(
            ["docker", "exec", "attendance-face-db", "psql", "-U", "face_admin", "-d", "attendance_face_system", "-tAc", f"UPDATE face_embeddings SET is_active = FALSE WHERE employee_id = {emp_db_id} AND is_active = TRUE;"], 
            capture_output=True, text=True, timeout=10
        )
        
        # Insert new
        emb_json = json.dumps(embedding)
        result = subprocess.run(
            ["docker", "exec", "attendance-face-db", "psql", "-U", "face_admin", "-d", "attendance_face_system", "-tAc", f"INSERT INTO face_embeddings (employee_id, embedding_vector, confidence_score, embedding_version, is_active, enrollment_date, created_at, updated_at) VALUES ({emp_db_id}, '{emb_json}', {confidence}, '{model_version}', TRUE, NOW(), NOW(), NOW()) RETURNING id;"], 
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode != 0:
            print(f"      DB ERROR: {result.stderr[:80]}")
            return False
        
        embedding_id = int(result.stdout.strip().split('\n')[0].strip())
        emb_np = np.array(embedding, dtype=np.float32)
        norm = np.linalg.norm(emb_np)
        print(f"      ID={embedding_id}, norm={norm:.4f}")
        
        return True
        
    except Exception as e:
        print(f"      DB ERROR: {str(e)[:80]}")
        return False

def main():
    print("\n" + "="*80)
    print("REAL FACE ENROLLMENT - Phase 2 (Docker)")
    print("="*80)
    print("\nMode: REAL (FACE_RECOGNITION_MODE=real)")
    print("Algorithm: FaceNet 2.0 (512-dim L2-normalized)\n")
    
    results = []
    
    for emp in TEST_EMPLOYEES:
        employee_id = emp["employee_id"]
        name = emp["name"]
        seed = emp["seed"]
        
        print(f"\n{'-'*80}")
        print(f"ENROLLING: {employee_id}")
        print(f"{'-'*80}")
        
        try:
            # Step 1: Create employee
            print(f"\n[STEP 1] Creating test employee...")
            emp_db_id = create_test_employee_docker(employee_id, name)
            if emp_db_id is None:
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            # Step 2: Generate faces
            print(f"\n[STEP 2] Generating realistic faces...")
            frames_b64 = []
            for i in range(3):
                frame_seed = seed + i * 100
                img = generate_realistic_face(seed=frame_seed, size=300)
                b64 = image_to_base64(img)
                frames_b64.append(b64)
            print(f"    Generated 3 frames")
            
            # Step 3: Enroll
            print(f"\n[STEP 3] Enrolling through face-ai-service...")
            enroll_response = enroll_face_real_mode(employee_id, frames_b64)
            
            if not enroll_response.get("success"):
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            print(f"    Registered, embedding_dim={enroll_response.get('embedding_dim')}")
            
            # Step 4: Store embedding
            print(f"\n[STEP 4] Storing embedding in database...")
            embedding = enroll_response.get("embedding")
            if not embedding:
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            embedding_np = np.array(embedding, dtype=np.float32)
            
            if not store_embedding_docker(emp_db_id, embedding, 0.85, "2.0-facenet-vggface2"):
                results.append({"employee_id": employee_id, "status": "FAILED"})
                continue
            
            print(f"\n[✓ SUCCESS] {employee_id} (DB ID={emp_db_id}) enrolled")
            results.append({
                "employee_id": employee_id,
                "db_id": emp_db_id,
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
        print(f"  ✓ {r['employee_id']} (DB ID={r['db_id']}): {r['embedding_dim']}D embedding")
    
    print(f"\n{'='*80}\n")
    
    with open("PHASE_2_ENROLLMENT_RESULTS.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "successful": len(successful),
            "total": len(results),
            "results": results
        }, f, indent=2)
    
    print(f"Results saved to PHASE_2_ENROLLMENT_RESULTS.json\n")
    return 0 if len(successful) == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
