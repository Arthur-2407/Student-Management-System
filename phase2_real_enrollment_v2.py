#!/usr/bin/env python3
"""
REAL Face Enrollment v2 - Downloads real faces from LFW dataset
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
import io
import os

FACE_AI_SERVICE_URL = "http://localhost:8000"
FACE_DB_HOST = "localhost"
FACE_DB_PORT = 5433
FACE_DB_NAME = "attendance_face"
FACE_DB_USER = "face_user"
FACE_DB_PASSWORD = "face_password"

# Real face URLs from LFW (Labeled Faces in the Wild)
REAL_FACE_URLS = [
    ("REAL_FACE_001", "http://vis-www.cs.umass.edu/lfw/lfw-funneled/Aaron_Eckhart/Aaron_Eckhart_0001.jpg"),
    ("REAL_FACE_002", "http://vis-www.cs.umass.edu/lfw/lfw-funneled/Atal_Bihari_Vajpayee/Atal_Bihari_Vajpayee_0001.jpg"),
    ("REAL_FACE_003", "http://vis-www.cs.umass.edu/lfw/lfw-funneled/Abdulrahman_al_Masri/Abdulrahman_al_Masri_0001.jpg"),
]

def download_face_image(url: str) -> np.ndarray:
    """Download image from URL and return as OpenCV matrix."""
    print(f"    Downloading: {url[:60]}...")
    response = requests.get(url, timeout=10)
    if response.status_code != 200:
        raise ValueError(f"Failed to download: HTTP {response.status_code}")
    
    nparr = np.frombuffer(response.content, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Failed to decode image")
    
    # Resize to reasonable size (max 400px)
    h, w = img.shape[:2]
    if h > 400 or w > 400:
        scale = min(400/h, 400/w)
        img = cv2.resize(img, None, fx=scale, fy=scale)
    
    return img

def image_to_base64(image: np.ndarray) -> str:
    """Convert OpenCV image to base64."""
    success, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not success:
        raise ValueError("Failed to encode")
    b64 = base64.b64encode(encoded).decode("utf-8")
    return f"data:image/jpeg;base64,{b64}"

def enroll_face_real_mode(employee_id: str, frames: List[str]) -> Dict:
    """Enroll face through face-ai-service."""
    print(f"  [ENROLL] POST /api/register-face for {employee_id}...")
    
    payload = {"employee_id": employee_id, "frames": frames}
    
    try:
        response = requests.post(
            f"{FACE_AI_SERVICE_URL}/api/register-face",
            json=payload,
            timeout=30
        )
        
        if response.status_code != 200:
            print(f"    [ERROR] HTTP {response.status_code}")
            return {"success": False, "error": response.text}
        
        result = response.json()
        print(f"    [✓] registered={result.get('registered')}, dim={result.get('embedding_dim')}")
        return result
        
    except Exception as e:
        print(f"    [ERROR] {str(e)}")
        return {"success": False, "error": str(e)}

def store_embedding_in_db(employee_id: str, embedding: List[float], 
                          confidence: float, model_version: str) -> bool:
    """Store embedding in database."""
    print(f"  [DB] Storing embedding...")
    
    try:
        conn = psycopg2.connect(
            host=FACE_DB_HOST,
            port=FACE_DB_PORT,
            database=FACE_DB_NAME,
            user=FACE_DB_USER,
            password=FACE_DB_PASSWORD
        )
        
        cursor = conn.cursor()
        
        # Deactivate existing
        cursor.execute(
            "UPDATE face_embeddings SET is_active = FALSE WHERE employee_id = %s AND is_active = TRUE",
            (employee_id,)
        )
        
        # Insert new
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
        
        emb_np = np.array(embedding[:5], dtype=np.float32)
        norm = np.linalg.norm(embedding)
        print(f"    [✓] ID={embedding_id}, first5={emb_np.tolist()}, norm={norm:.4f}")
        
        return True
        
    except Exception as e:
        print(f"    [DB ERROR] {str(e)}")
        return False

def main():
    print("\n" + "="*80)
    print("REAL FACE ENROLLMENT - Phase 2 (LFW Dataset)")
    print("="*80)
    print("\nUsing real faces from Labeled Faces in the Wild (LFW)")
    print("Mode: REAL (FACE_RECOGNITION_MODE=real)")
    print("Algorithm: FaceNet 2.0 (512-dim L2-normalized)\n")
    
    results = []
    
    for employee_id, url in REAL_FACE_URLS:
        print(f"\n{'-'*80}")
        print(f"ENROLLING: {employee_id}")
        print(f"{'-'*80}")
        
        try:
            # Download image
            print(f"\n[STEP 1] Downloading real face image...")
            img = download_face_image(url)
            print(f"    Image size: {img.shape}")
            
            # Create frame set (same image 3 times for consistency)
            print(f"\n[STEP 2] Preparing frames...")
            frames_b64 = [image_to_base64(img) for _ in range(3)]
            print(f"    {len(frames_b64)} frames prepared")
            
            # Enroll
            print(f"\n[STEP 3] Enrolling through face-ai-service...")
            enroll_response = enroll_face_real_mode(employee_id, frames_b64)
            
            if not enroll_response.get("success"):
                print(f"  [FAILED] {enroll_response.get('error')}")
                results.append({"employee_id": employee_id, "status": "FAILED", "error": enroll_response.get('error')})
                continue
            
            # Process embedding
            print(f"\n[STEP 4] Processing embedding...")
            embedding = enroll_response.get("embedding")
            if not embedding:
                print(f"  [ERROR] No embedding in response")
                results.append({"employee_id": employee_id, "status": "FAILED", "error": "No embedding"})
                continue
            
            embedding_np = np.array(embedding, dtype=np.float32)
            print(f"    Shape: {embedding_np.shape}")
            print(f"    Norm: {np.linalg.norm(embedding_np):.6f}")
            
            # Store
            print(f"\n[STEP 5] Storing in database...")
            if not store_embedding_in_db(employee_id, embedding, 0.9, "2.0-facenet-vggface2"):
                results.append({"employee_id": employee_id, "status": "FAILED", "error": "DB store failed"})
                continue
            
            print(f"\n[✓ SUCCESS] {employee_id} enrolled")
            results.append({
                "employee_id": employee_id,
                "status": "SUCCESS",
                "embedding_dim": len(embedding),
                "norm": float(np.linalg.norm(embedding_np)),
                "source": "LFW"
            })
            
        except Exception as e:
            print(f"\n[EXCEPTION] {str(e)}")
            results.append({"employee_id": employee_id, "status": "FAILED", "error": str(e)})
    
    # Summary
    print(f"\n\n" + "="*80)
    print("ENROLLMENT SUMMARY")
    print("="*80)
    
    successful = [r for r in results if r["status"] == "SUCCESS"]
    print(f"\nSuccessful: {len(successful)}/{len(results)}")
    for r in successful:
        print(f"  ✓ {r['employee_id']}: {r['embedding_dim']}D embedding")
    
    failed = [r for r in results if r["status"] != "SUCCESS"]
    if failed:
        print(f"\nFailed: {len(failed)}")
        for r in failed:
            print(f"  ✗ {r['employee_id']}: {r['error']}")
    
    print(f"\n{'='*80}\n")
    
    with open("PHASE_2_ENROLLMENT_RESULTS.json", "w") as f:
        json.dump({
            "timestamp": datetime.now().isoformat(),
            "successful": len(successful),
            "total": len(results),
            "mode": "REAL",
            "source": "LFW",
            "results": results
        }, f, indent=2)
    
    print(f"Results saved to PHASE_2_ENROLLMENT_RESULTS.json\n")
    
    return 0 if len(successful) == len(results) else 1

if __name__ == "__main__":
    sys.exit(main())
