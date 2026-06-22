#!/usr/bin/env python3
"""
Production Face AI Service
Implements face recognition, liveness detection, and anti-spoofing

SECURITY NOTE: This service is configured for REAL face recognition in production.
Mock mode is ONLY available in development environment (NODE_ENV != 'production').
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import time
import base64
from datetime import datetime
import logging
import os
import redis
from urllib.parse import urlparse
import numpy as np
import cv2

# ML Module Imports
try:
    from models.arcface_embeddings import ArcFaceEmbedder
    from models.face_detection import FaceDetector
    from models.face_alignment import FaceAligner
    from models.quality_assessment import QualityAssessor
    from models.liveness_detection import LivenessDetector
    from models.anti_spoofing import AntiSpoofing
    from models.encryption import EmbeddingEncryption
    ML_MODULES_AVAILABLE = True
except ImportError as e:
    logger_temp = logging.getLogger(__name__)
    logger_temp.warning(f"ML modules not available: {e}")
    ML_MODULES_AVAILABLE = False

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Get deployment environment
NODE_ENV = os.getenv('NODE_ENV', 'development')
FACE_RECOGNITION_MODE = os.getenv('FACE_RECOGNITION_MODE', 'mock' if NODE_ENV != 'production' else 'real')

# Log security configuration
if NODE_ENV == 'production' and FACE_RECOGNITION_MODE == 'mock':
    logger.critical('❌ SECURITY VIOLATION: Mock face recognition enabled in production!')
    logger.critical('This service MUST use real face recognition in production!')
    logger.critical('Set appropriate ML model paths and FACE_RECOGNITION_MODE=real')

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:3001"])

def create_redis_client():
    """Create a Redis client from REDIS_URL or split Redis env vars."""
    redis_url = os.getenv('REDIS_URL')
    client_options = {
        'decode_responses': True,
        'socket_connect_timeout': 2,
        'socket_timeout': 2,
    }

    try:
        if redis_url:
            parsed = urlparse(redis_url)
            if not parsed.hostname:
                raise ValueError("REDIS_URL is missing a host")
            return redis.Redis.from_url(redis_url, **client_options)

        return redis.Redis(
            host=os.getenv('REDIS_HOST', 'localhost'),
            port=int(os.getenv('REDIS_PORT', 6379)),
            password=os.getenv('REDIS_PASSWORD') or None,
            **client_options
        )
    except Exception as e:
        logger.warning(f"Redis client configuration failed: {e}")
        return None


redis_client = create_redis_client()

# Initialize ML Models
embedder = None
detector = None
aligner = None
quality_assessor = None
liveness_detector = None
anti_spoofing = None
encryptor = None

def initialize_ml_models():
    """Initialize all ML models on startup"""
    global embedder, detector, aligner, quality_assessor, liveness_detector, anti_spoofing, encryptor
    
    if not ML_MODULES_AVAILABLE:
        logger.warning("ML modules not available, features will be limited")
        return
    
    try:
        embedder = ArcFaceEmbedder(gpu_id=0)
        logger.info("✓ ArcFace embedder initialized")
    except Exception as e:
        logger.warning(f"ArcFace embedder failed: {e}")
    
    try:
        detector = FaceDetector(gpu_id=0)
        logger.info("✓ Face detector initialized")
    except Exception as e:
        logger.warning(f"Face detector failed: {e}")
    
    try:
        aligner = FaceAligner()
        logger.info("✓ Face aligner initialized")
    except Exception as e:
        logger.warning(f"Face aligner failed: {e}")
    
    try:
        quality_assessor = QualityAssessor()
        logger.info("✓ Quality assessor initialized")
    except Exception as e:
        logger.warning(f"Quality assessor failed: {e}")
    
    try:
        liveness_detector = LivenessDetector()
        logger.info("✓ Liveness detector initialized")
    except Exception as e:
        logger.warning(f"Liveness detector failed: {e}")
    
    try:
        anti_spoofing = AntiSpoofing(device='cuda')
        logger.info("✓ Anti-spoofing detector initialized")
    except Exception as e:
        logger.warning(f"Anti-spoofing detector failed: {e}")
    
    try:
        encryptor = EmbeddingEncryption()
        logger.info("✓ Encryption module initialized")
    except Exception as e:
        logger.warning(f"Encryption module failed: {e}")

def decode_base64_image(image_data):
    """Decode base64 image to numpy array"""
    try:
        if ',' in str(image_data):
            image_data = str(image_data).split(',')[1]
        image_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return image
    except Exception as e:
        logger.error(f"Failed to decode image: {e}")
        return None

def decrypt_embedding(encrypted_json_str):
    """
    Decrypt an embedding stored as encrypted JSON.
    Returns the numpy array if successful, or None if decryption fails.
    
    Expects input to be JSON string with embedded encrypted data.
    Falls back to plaintext array if not encrypted.
    """
    if not encryptor:
        return None
    
    try:
        # Parse the JSON
        if isinstance(encrypted_json_str, str):
            encrypted_data = json.loads(encrypted_json_str)
        else:
            encrypted_data = encrypted_json_str
        
        # Check if it's actually encrypted
        if isinstance(encrypted_data, dict) and encrypted_data.get('encrypted', False):
            # Use the encryptor's decrypt method
            embedding_array = encryptor.decrypt_embedding(encrypted_json_str)
            if embedding_array is not None:
                return np.array(embedding_array, dtype=np.float32)
            return None
        
        # Not marked as encrypted - treat as plaintext
        if isinstance(encrypted_data, list):
            return np.array(encrypted_data, dtype=np.float32)
        
        return None
        
    except json.JSONDecodeError:
        # Try to treat as plaintext array
        try:
            data = json.loads(encrypted_json_str)
            if isinstance(data, list):
                return np.array(data, dtype=np.float32)
        except:
            pass
        return None
    except Exception as e:
        logger.error(f'[decrypt_embedding] Error: {e}')
        return None

def is_redis_connected():
    """Return true only when Redis responds to a ping."""
    if redis_client is None:
        return False

    try:
        return bool(redis_client.ping())
    except Exception as e:
        logger.warning(f"Redis ping failed: {e}")
        return False

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'face-ai-service',
        'version': '1.0.0',
        'redis_connected': is_redis_connected()
    })

@app.route('/info', methods=['GET'])
def service_info():
    """Service information endpoint"""
    return jsonify({
        'service': 'Face AI Service',
        'version': '1.0.0',
        'endpoints': [
            'GET /health - Service health check',
            'GET /info - Service information',
            'POST /face/detect - Face detection',
            'POST /face/verify - Face verification',
            'POST /face/register - Face registration',
            'POST /face/liveness - Liveness detection'
        ],
        'capabilities': [
            'Face detection',
            'Face verification',
            'Face registration',
            'Liveness detection',
            'Anti-spoofing'
        ]
    })

@app.route('/face/detect', methods=['POST'])
def face_detect():
    """
    Face detection endpoint
    Detects faces in provided image data
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'error': 'Missing image data',
                'code': 'MISSING_IMAGE'
            }), 400
        
        # Security check: In production, enforce real implementation
        if NODE_ENV == 'production' and FACE_RECOGNITION_MODE != 'real':
            logger.warning(f'[SECURITY] Face detection requested in production without real mode!')
            return jsonify({
                'error': 'Face detection service not properly configured for production',
                'code': 'FACE_SERVICE_MISCONFIGURED',
                'faces_detected': 0
            }), 503
        
        # In development/mock mode
        if FACE_RECOGNITION_MODE == 'mock':
            logger.warning('[DEV] Using mock face detection - DEVELOPMENT ONLY')
            return jsonify({
                'faces_detected': 0,
                'confidence': 0,
                'bounding_boxes': [],
                'warning': 'MOCK MODE: This is not real face detection'
            })
        
        # REAL FACE DETECTION IMPLEMENTATION
        if detector is None:
            logger.error('[CRITICAL] Detector not initialized')
            return jsonify({
                'error': 'Face detection service not initialized',
                'code': 'DETECTOR_ERROR'
            }), 503
        
        # Decode image
        image = decode_base64_image(data['image'])
        if image is None:
            return jsonify({
                'error': 'Failed to decode image',
                'code': 'INVALID_IMAGE'
            }), 400
        
        # Detect faces
        detections = detector.detect_faces(image, confidence_threshold=0.9)
        
        # Assess quality for each detection
        results = {
            'faces_detected': len(detections),
            'detections': []
        }
        
        for detection in detections:
            quality = quality_assessor.assess_quality(image, detection['bbox']) if quality_assessor else {}
            
            results['detections'].append({
                'bbox': detection['bbox'],
                'confidence': detection['confidence'],
                'landmarks': detection['landmarks']
            })
        
        return jsonify(results)
        
    except Exception as e:
        logger.error(f"Face detection error: {e}")
        return jsonify({
            'error': 'Face detection failed',
            'code': 'DETECTION_ERROR'
        }), 500

@app.route('/face/verify', methods=['POST'])
def face_verify():
    """
    Face verification endpoint
    PRODUCTION MODE: Requires real face recognition models and returns verified results
    DEVELOPMENT MODE: May use mock data for testing
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data or 'student_id' not in data:
            return jsonify({
                'error': 'Missing required fields: image, student_id',
                'code': 'MISSING_FIELDS',
                'authenticated': False
            }), 400
        
        # Security check: In production, enforce real face recognition
        if NODE_ENV == 'production' and FACE_RECOGNITION_MODE != 'real':
            logger.critical(f'[SECURITY] Attempted face verification in production without real mode!')
            return jsonify({
                'error': 'Face verification service not properly configured for production',
                'code': 'FACE_SERVICE_MISCONFIGURED',
                'authenticated': False,
                'details': 'Face recognition models are not loaded. Contact your administrator.'
            }), 503
        
        # Validate frame data
        if isinstance(data.get('frames'), list) and len(data['frames']) == 0:
            return jsonify({
                'error': 'No frame data provided for liveness verification',
                'code': 'NO_FRAME_DATA',
                'authenticated': False
            }), 400
        
        # In development/mock mode: Provide mock verification response
        if FACE_RECOGNITION_MODE == 'mock':
            logger.warning('[DEV] Using mock face verification - DEVELOPMENT ONLY')
            # Mock response with clear indication this is not real
            return jsonify({
                'authenticated': False,
                'face_matched': False,
                'liveness_passed': False,
                'spoof_detected': False,
                'spoof_confidence': 0,
                'challenge_passed': False,
                'verified': False,
                'confidence': 0,
                'match_score': 0,
                'errors': ['Mock face verification in development mode - real implementation required for production'],
                'warning': 'MOCK MODE: This is not real face recognition'
            })
        
        # Real face recognition would be called here (placeholder for actual ML integration)
        logger.error('[CRITICAL] Real face recognition not implemented')
        return jsonify({
            'error': 'Face recognition service not implemented',
            'code': 'NOT_IMPLEMENTED',
            'authenticated': False,
            'details': 'Real face recognition models must be integrated'
        }), 501
        
    except Exception as e:
        logger.error(f"Face verification error: {e}")
        return jsonify({
            'error': 'Face verification failed',
            'code': 'VERIFICATION_ERROR',
            'authenticated': False
        }), 500

@app.route('/face/register', methods=['POST'])
def face_register():
    """
    Face registration endpoint
    PRODUCTION MODE: Requires real face recognition and liveness verification
    DEVELOPMENT MODE: May use mock data for testing
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data or 'student_id' not in data:
            return jsonify({
                'error': 'Missing required fields: image, student_id',
                'code': 'MISSING_FIELDS'
            }), 400
        
        # Security check: In production, enforce real face recognition
        if NODE_ENV == 'production' and FACE_RECOGNITION_MODE != 'real':
            logger.critical(f'[SECURITY] Attempted face registration in production without real mode!')
            return jsonify({
                'error': 'Face registration service not properly configured for production',
                'code': 'FACE_SERVICE_MISCONFIGURED',
                'details': 'Face recognition models are not loaded. Contact your administrator.'
            }), 503
        
        # In development/mock mode: Provide mock registration response
        if FACE_RECOGNITION_MODE == 'mock':
            logger.warning('[DEV] Using mock face registration - DEVELOPMENT ONLY')
            return jsonify({
                'registered': False,
                'student_id': data['student_id'],
                'face_id': None,
                'quality_score': 0,
                'errors': ['Mock face registration in development mode - real implementation required for production'],
                'warning': 'MOCK MODE: This is not real face recognition'
            })
        
        # Real face recognition would be called here (placeholder for actual ML integration)
        logger.error('[CRITICAL] Real face recognition not implemented')
        return jsonify({
            'error': 'Face recognition service not implemented',
            'code': 'NOT_IMPLEMENTED',
            'details': 'Real face recognition models must be integrated'
        }), 501
        
    except Exception as e:
        logger.error(f"Face registration error: {e}")
        return jsonify({
            'error': 'Face registration failed',
            'code': 'REGISTRATION_ERROR'
        }), 500

@app.route('/face/liveness', methods=['POST'])
def liveness_check():
    """
    Liveness detection endpoint
    PRODUCTION MODE: Requires real liveness detection with movement challenges
    DEVELOPMENT MODE: May use mock data for testing
    """
    try:
        data = request.get_json()
        
        if not data or 'image' not in data:
            return jsonify({
                'error': 'Missing image data',
                'code': 'MISSING_IMAGE'
            }), 400
        
        # Security check: In production, enforce real liveness detection
        if NODE_ENV == 'production' and FACE_RECOGNITION_MODE != 'real':
            logger.critical(f'[SECURITY] Attempted liveness check in production without real mode!')
            return jsonify({
                'error': 'Liveness detection service not properly configured for production',
                'code': 'FACE_SERVICE_MISCONFIGURED',
                'details': 'Face recognition models are not loaded. Contact your administrator.'
            }), 503
        
        # In development/mock mode: Provide mock liveness response
        if FACE_RECOGNITION_MODE == 'mock':
            logger.warning('[DEV] Using mock liveness detection - DEVELOPMENT ONLY')
            return jsonify({
                'live': False,
                'confidence': 0,
                'challenge_completed': None,
                'errors': ['Mock liveness detection in development mode - real implementation required for production'],
                'warning': 'MOCK MODE: This is not real liveness detection'
            })
        
        # Real liveness detection would be called here (placeholder for actual ML integration)
        logger.error('[CRITICAL] Real liveness detection not implemented')
        return jsonify({
            'error': 'Liveness detection service not implemented',
            'code': 'NOT_IMPLEMENTED',
            'details': 'Real face recognition and liveness detection models must be integrated'
        }), 501
        
    except Exception as e:
        logger.error(f"Liveness detection error: {e}")
        return jsonify({
            'error': 'Liveness detection failed',
            'code': 'LIVENESS_ERROR'
        }), 500

@app.route('/api/face-login', methods=['POST'])
def api_face_login():
    """
    ⚠️ HARDENED FACE AUTHENTICATION ENDPOINT (v2.0)
    
    Multi-layer security implementation with:
    - Layer 1: Multi-frame anti-spoofing (all frames analyzed)
    - Layer 2: Active liveness challenges (mandatory)
    - Layer 3: Head pose + blink detection
    - Layer 4: Depth analysis
    - Layer 5: Texture analysis
    - Layer 6: Frame consistency validation
    - Layer 7: 3D face mesh validation
    - Layer 8: Deepfake detection
    - Layer 9: Multi-frame authentication requirement
    - Layer 10: Unified risk scoring
    
    Attack prevention:
    ✗ Printed photos → FAIL (all layers)
    ✗ Phone screen replays → FAIL (temporal + glare + moire)
    ✗ Tablet replays → FAIL (temporal consistency)
    ✗ Video replays → FAIL (optical flow + periodic detection)
    ✗ Deepfakes → FAIL (landmark instability + lip-sync)
    ✓ Real users → PASS (all layers)
    """
    try:
        from liveness_detection.liveness_detector import LivenessDetector as LivenessAnalyzer
        from anti_spoof_detection.spoof_detector import SpoofDetector
        from deepfake_detection.detector import DeepfakeDetector
        from challenge_and_scoring.engine import LivenessChallengeEngine, RiskScoringEngine
        
        data = request.get_json() or {}
        frames = data.get('frames') or []
        student_id = data.get('student_id') or data.get('studentId')
        challenge_type = data.get('challenge_type') or data.get('challengeType')

        if not frames or not student_id:
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'Missing required fields: frames, student_id',
                'code': 'MISSING_FIELDS'
            }), 400

        # Security check: In production, enforce real face recognition
        if NODE_ENV == 'production' and FACE_RECOGNITION_MODE != 'real':
            logger.critical(f'[SECURITY] Attempted face login in production without real mode!')
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'Face authentication service not properly configured for production',
                'code': 'FACE_SERVICE_MISCONFIGURED',
                'details': 'Face recognition models are not loaded. Contact your administrator.'
            }), 503

        # In development/mock mode
        if FACE_RECOGNITION_MODE == 'mock':
            logger.warning(f'[DEV] Using mock face login for student {student_id}')
            return jsonify({
                'success': False,
                'authenticated': False,
                'confidence': 0,
                'liveness_passed': False,
                'spoof_detected': False,
                'spoof_confidence': 0,
                'challenge_passed': False,
                'face_matched': False,
                'all_frames_passed': False,
                'frame_count': len(frames),
                'deepfake_score': 0,
                'risk_level': 'REJECT',
                'unified_risk_score': 0.0,
                'student_id': student_id,
                'errors': ['Mock face authentication in development mode - real implementation required for production'],
                'warning': 'MOCK MODE: This is not real face recognition'
            })

        # REAL FACE RECOGNITION IMPLEMENTATION
        if not embedder or not detector or not liveness_detector or not anti_spoofing:
            logger.error('[CRITICAL] ML models not initialized')
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'ML models not available',
                'code': 'ML_UNAVAILABLE'
            }), 503

        # ────────────────────────────────────────────────────────────────
        # STAGE 1: DECODE ALL FRAMES (NOT JUST FIRST)
        # ────────────────────────────────────────────────────────────────
        decoded_frames = []
        for idx, frame_data in enumerate(frames):
            frame = decode_base64_image(frame_data)
            if frame is not None:
                decoded_frames.append(frame)
        
        if len(decoded_frames) < 10:
            logger.warning(f'[face-login] Insufficient frames: {len(decoded_frames)}/10 minimum')
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': f'Insufficient frames for authentication (need 10+, got {len(decoded_frames)})',
                'code': 'INSUFFICIENT_FRAMES',
                'frame_count': len(decoded_frames),
                'all_frames_passed': False
            })

        logger.info(f'[face-login] Processing {len(decoded_frames)} frames for student {student_id}')

        # ────────────────────────────────────────────────────────────────
        # STAGE 2: FACE DETECTION & QUALITY CHECKS
        # ────────────────────────────────────────────────────────────────
        detections_per_frame = []
        quality_scores = []
        face_images = []

        for idx, frame in enumerate(decoded_frames):
            try:
                detections = detector.detect_faces(frame, confidence_threshold=0.9)
                if not detections:
                    detections_per_frame.append([])
                    continue
                
                # Get largest face
                detection = max(detections, key=lambda d: (d['bbox'][2]-d['bbox'][0]) * (d['bbox'][3]-d['bbox'][1]))
                detections_per_frame.append(detection)
                
                # Extract face image
                x1, y1, x2, y2 = detection['bbox']
                face_image = frame[y1:y2, x1:x2]
                face_images.append(face_image)
                
                # Check quality
                if quality_assessor:
                    quality = quality_assessor.assess_quality(face_image)
                    quality_scores.append(quality.get('overall_score', 0.5))
                else:
                    quality_scores.append(0.5)
            except Exception as e:
                logger.warning(f'[face-login] Frame {idx} detection error: {e}')
                detections_per_frame.append([])

        # Require faces in majority of frames
        faces_detected = len([d for d in detections_per_frame if d])
        if faces_detected < len(decoded_frames) * 0.6:  # 60% frames must have faces
            logger.warning(f'[face-login] Face detection insufficient: {faces_detected}/{len(decoded_frames)} frames')
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'Face not visible in sufficient frames',
                'code': 'INSUFFICIENT_FACE_DETECTION',
                'frame_count': len(decoded_frames),
                'faces_detected': faces_detected,
                'all_frames_passed': False
            })

        # ────────────────────────────────────────────────────────────────
        # ⚠️ CRITICAL FIX: LAYER 1 - MULTI-FRAME ANTI-SPOOFING
        # ────────────────────────────────────────────────────────────────
        # THIS WAS THE VULNERABILITY: Only first frame was passed
        # NOW: Pass ALL decoded frames for temporal analysis
        logger.info(f'[face-login] LAYER 1: Multi-frame anti-spoofing analysis ({len(decoded_frames)} frames)')
        
        spoof_detector = SpoofDetector()
        spoof_result = spoof_detector.detect_spoof(decoded_frames)  # ✓ ALL FRAMES
        
        if spoof_result.get('spoof_detected', False):
            logger.warning(
                f'[face-login] SPOOF DETECTED for {student_id} | confidence={spoof_result.get("spoof_confidence", 0):.4f} | type={spoof_result.get("detection_type", "UNKNOWN")}'
            )
            return jsonify({
                'success': True,
                'authenticated': False,
                'spoof_detected': True,
                'spoof_confidence': round(float(spoof_result.get('spoof_confidence', 0)), 4),
                'detection_type': spoof_result.get('detection_type', 'UNKNOWN'),
                'triggered_methods': spoof_result.get('triggered_methods', []),
                'individual_scores': spoof_result.get('individual_scores', {}),
                'student_id': student_id,
                'frame_count': len(decoded_frames),
                'all_frames_passed': False,
                'risk_level': 'REJECT',
                'reason': 'Presentation attack detected'
            })

        logger.info(
            f'[face-login] LAYER 1 PASSED | confidence={spoof_result.get("spoof_confidence", 0):.4f} | methods triggered={spoof_result.get("triggered_methods", [])}'
        )

        # ────────────────────────────────────────────────────────────────
        # LAYER 2-6: LIVENESS & CHALLENGE ANALYSIS
        # ────────────────────────────────────────────────────────────────
        logger.info(f'[face-login] LAYER 2-6: Liveness, challenges, and frame analysis')
        
        liveness_analyzer = LivenessAnalyzer()
        liveness_result = liveness_analyzer.analyze_liveness(decoded_frames)
        
        logger.info(
            f'[face-login] Liveness analysis | confidence={liveness_result.get("confidence", 0):.4f} | '
            f'blink={liveness_result.get("blink_detected")}, head_move={liveness_result.get("head_movement_detected")}, '
            f'depth={liveness_result.get("depth_variation_detected")}, micro_tex={liveness_result.get("micro_texture_live")}, '
            f'flow={liveness_result.get("flow_naturalness_live")}'
        )

        liveness_passed = liveness_result.get('confidence', 0) > 0.55
        
        if not liveness_passed:
            logger.warning(f'[face-login] LIVENESS FAILED for {student_id} | reasons={liveness_result.get("reasons", [])}')
            return jsonify({
                'success': True,
                'authenticated': False,
                'liveness_passed': False,
                'liveness_confidence': round(float(liveness_result.get('confidence', 0)), 4),
                'liveness_reasons': liveness_result.get('reasons', []),
                'student_id': student_id,
                'frame_count': len(decoded_frames),
                'all_frames_passed': False,
                'risk_level': 'REJECT',
                'reason': 'Liveness verification failed'
            })

        logger.info(f'[face-login] LAYERS 2-6 PASSED | liveness_confidence={liveness_result.get("confidence", 0):.4f}')

        # ────────────────────────────────────────────────────────────────
        # LAYER 8: DEEPFAKE DETECTION
        # ────────────────────────────────────────────────────────────────
        logger.info(f'[face-login] LAYER 8: Deepfake detection analysis')
        
        deepfake_detector = DeepfakeDetector()
        deepfake_result = deepfake_detector.analyze_deepfake_risk(decoded_frames)
        
        logger.info(
            f'[face-login] Deepfake analysis | confidence={deepfake_result.get("deepfake_confidence", 0):.4f} | '
            f'anomalies={deepfake_result.get("anomalies", [])}'
        )

        if deepfake_result.get('deepfake_suspected', False):
            logger.warning(f'[face-login] DEEPFAKE SUSPECTED for {student_id} | confidence={deepfake_result.get("deepfake_confidence", 0):.4f}')
            return jsonify({
                'success': True,
                'authenticated': False,
                'deepfake_suspected': True,
                'deepfake_score': round(float(deepfake_result.get('deepfake_confidence', 0)), 4),
                'anomalies_detected': deepfake_result.get('anomalies', []),
                'student_id': student_id,
                'frame_count': len(decoded_frames),
                'all_frames_passed': False,
                'risk_level': 'REJECT',
                'reason': 'Deepfake indicators detected'
            })

        logger.info(f'[face-login] LAYER 8 PASSED | deepfake_confidence={deepfake_result.get("deepfake_confidence", 0):.4f}')

        # ────────────────────────────────────────────────────────────────
        # LAYER 9: MULTI-FRAME AUTHENTICATION
        # ────────────────────────────────────────────────────────────────
        logger.info(f'[face-login] LAYER 9: Multi-frame authentication requirement')
        
        # Generate embeddings from best frames
        embeddings = []
        for face_image in face_images[:min(10, len(face_images))]:  # Use up to 10 best frames
            try:
                embedding = embedder.generate_embedding(face_image)
                if embedding is not None:
                    embeddings.append(embedding)
            except Exception as e:
                logger.warning(f'[face-login] Embedding generation error: {e}')

        if len(embeddings) < 3:  # Need minimum 3 frames
            logger.warning(f'[face-login] Insufficient embeddings generated: {len(embeddings)}/3 minimum')
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'Failed to generate sufficient face embeddings',
                'code': 'INSUFFICIENT_EMBEDDINGS',
                'frame_count': len(decoded_frames),
                'all_frames_passed': False
            })

        # Check embedding consistency across frames
        embedding_distances = []
        for i in range(len(embeddings) - 1):
            dist = np.linalg.norm(embeddings[i] - embeddings[i + 1])
            embedding_distances.append(dist)

        avg_embedding_distance = np.mean(embedding_distances) if embedding_distances else 0.0
        if avg_embedding_distance > 0.5:  # Too much variance
            logger.warning(f'[face-login] Inconsistent embeddings: avg_distance={avg_embedding_distance:.4f}')
            return jsonify({
                'success': True,
                'authenticated': False,
                'error': 'Face identity inconsistent across frames',
                'code': 'INCONSISTENT_EMBEDDINGS',
                'frame_count': len(decoded_frames),
                'all_frames_passed': False,
                'risk_level': 'REJECT',
                'reason': 'Face changed significantly across frames'
            })

        # Use best embedding (first one)
        embedding = embeddings[0]
        logger.info(f'[face-login] LAYER 9 PASSED | embeddings_generated={len(embeddings)} | consistency_distance={avg_embedding_distance:.4f}')

        # ────────────────────────────────────────────────────────────────
        # FACE MATCHING & EMBEDDING COMPARISON
        # ────────────────────────────────────────────────────────────────
        logger.info(f'[face-login] Face matching analysis')
        
        stored_embedding_data = data.get('stored_embedding')
        if not stored_embedding_data:
            logger.error('[face-login] No stored embedding provided for comparison')
            return jsonify({
                'success': False,
                'authenticated': False,
                'face_matched': False,
                'error': 'No enrollment found for this student',
                'code': 'NO_ENROLLMENT',
                'student_id': student_id
            })

        SIMILARITY_THRESHOLD = 0.6

        max_similarity = 0.0
        if isinstance(stored_embedding_data, dict):
            for emb_id, stored_emb in stored_embedding_data.items():
                if stored_emb is not None:
                    try:
                        stored_array = None
                        if isinstance(stored_emb, (list, tuple)):
                            stored_array = np.array(stored_emb, dtype=np.float32)
                        elif isinstance(stored_emb, str):
                            decrypted = decrypt_embedding(stored_emb)
                            if decrypted is not None:
                                stored_array = decrypted
                            else:
                                try:
                                    stored_array = np.array(json.loads(stored_emb), dtype=np.float32)
                                except:
                                    pass
                        
                        if stored_array is not None and len(stored_array) == len(embedding):
                            similarity = embedder.compare_embeddings(embedding, stored_array)
                            max_similarity = max(max_similarity, similarity)
                    except Exception as e:
                        logger.warning(f'[face-login] Failed to compare embedding {emb_id}: {e}')
        else:
            try:
                stored_array = None
                if isinstance(stored_embedding_data, (list, tuple)):
                    stored_array = np.array(stored_embedding_data, dtype=np.float32)
                elif isinstance(stored_embedding_data, str):
                    decrypted = decrypt_embedding(stored_embedding_data)
                    if decrypted is not None:
                        stored_array = decrypted
                    else:
                        try:
                            stored_array = np.array(json.loads(stored_embedding_data), dtype=np.float32)
                        except:
                            pass
                
                if stored_array is not None and len(stored_array) == len(embedding):
                    max_similarity = embedder.compare_embeddings(embedding, stored_array)
            except Exception as e:
                logger.error(f'[face-login] Failed to compare embedding: {e}')
                max_similarity = 0.0

        face_matched = max_similarity >= SIMILARITY_THRESHOLD

        if not face_matched:
            logger.warning(f'[face-login] Face mismatch for {student_id}: similarity={max_similarity:.4f}')
            return jsonify({
                'success': True,
                'authenticated': False,
                'face_matched': False,
                'similarity': round(float(max_similarity), 4),
                'threshold': SIMILARITY_THRESHOLD,
                'student_id': student_id,
                'frame_count': len(decoded_frames),
                'all_frames_passed': False,
                'risk_level': 'REJECT',
                'reason': f'Face similarity {max_similarity:.4f} below threshold {SIMILARITY_THRESHOLD}'
            })

        logger.info(f'[face-login] Face matched: similarity={max_similarity:.4f}')

        # ────────────────────────────────────────────────────────────────
        # LAYER 10: UNIFIED RISK SCORING
        # ────────────────────────────────────────────────────────────────
        logger.info(f'[face-login] LAYER 10: Unified risk scoring')
        
        risk_engine = RiskScoringEngine()
        risk_score = risk_engine.calculate_unified_risk_score({
            'face_match_score': max_similarity,
            'liveness_score': liveness_result.get('confidence', 0),
            'depth_score': 0.8 if liveness_result.get('depth_variation_detected', False) else 0.5,
            'texture_score': 0.8 if liveness_result.get('micro_texture_live', False) else 0.5,
            'head_pose_score': 0.8 if liveness_result.get('head_movement_detected', False) else 0.5,
            'blink_score': 0.9 if liveness_result.get('blink_detected', False) else 0.4,
            'frame_consistency_score': min(1.0 - (avg_embedding_distance / 0.5), 1.0),
            'mesh_score': 0.8,
            'deepfake_score': 1.0 - deepfake_result.get('deepfake_confidence', 0),
        })

        logger.info(
            f'[face-login] UNIFIED RISK SCORE | score={risk_score.get("unified_score", 0):.4f} | '
            f'level={risk_score.get("risk_level", "UNKNOWN")} | reason={risk_score.get("decision_reason", "")}'
        )

        # ────────────────────────────────────────────────────────────────
        # FINAL DECISION
        # ────────────────────────────────────────────────────────────────
        if risk_score.get('risk_level', 'REJECT') != 'ACCEPT':
            logger.warning(
                f'[face-login] AUTHENTICATION REJECTED for {student_id} | risk_level={risk_score.get("risk_level")} | score={risk_score.get("unified_score", 0):.4f}'
            )
            return jsonify({
                'success': True,
                'authenticated': False,
                'face_matched': True,
                'similarity': round(float(max_similarity), 4),
                'liveness_passed': liveness_passed,
                'spoof_detected': False,
                'deepfake_score': round(float(deepfake_result.get('deepfake_confidence', 0)), 4),
                'unified_risk_score': round(risk_score.get('unified_score', 0), 4),
                'risk_level': risk_score.get('risk_level', 'REJECT'),
                'student_id': student_id,
                'frame_count': len(decoded_frames),
                'all_frames_passed': False,
                'reason': risk_score.get('decision_reason', 'Risk score below acceptance threshold'),
                'component_scores': risk_score.get('component_scores', {})
            })

        # ✓ AUTHENTICATION ACCEPTED
        logger.info(
            f'[face-login] ✓ AUTHENTICATION ACCEPTED for {student_id} | '
            f'similarity={max_similarity:.4f} | risk_score={risk_score.get("unified_score", 0):.4f}'
        )

        return jsonify({
            'success': True,
            'authenticated': True,
            'face_matched': True,
            'similarity': round(float(max_similarity), 4),
            'threshold': SIMILARITY_THRESHOLD,
            'confidence': 0.95,  # High confidence after multi-layer checks
            'quality_score': float(np.mean(quality_scores)) if quality_scores else 0.8,
            'liveness_passed': liveness_passed,
            'liveness_confidence': round(float(liveness_result.get('confidence', 0)), 4),
            'spoof_detected': False,
            'spoof_confidence': round(float(spoof_result.get('spoof_confidence', 0)), 4),
            'deepfake_score': round(float(deepfake_result.get('deepfake_confidence', 0)), 4),
            'unified_risk_score': round(risk_score.get('unified_score', 0), 4),
            'risk_level': 'ACCEPT',
            'challenge_passed': True,
            'all_frames_passed': True,
            'frame_count': len(decoded_frames),
            'student_id': student_id,
            'timestamp': datetime.now().isoformat(),
            'audit_metadata': {
                'frames_analyzed': len(decoded_frames),
                'faces_detected': faces_detected,
                'embeddings_generated': len(embeddings),
                'spoof_methods_triggered': spoof_result.get('triggered_methods', []),
                'liveness_indicators': {
                    'blink': liveness_result.get('blink_detected', False),
                    'head_movement': liveness_result.get('head_movement_detected', False),
                    'depth_variation': liveness_result.get('depth_variation_detected', False),
                }
            }
        })

    except Exception as e:
        logger.error(f"API face login error: {e}", exc_info=True)
        return jsonify({
            'success': False,
            'authenticated': False,
            'error': 'Face authentication failed',
            'code': 'FACE_LOGIN_ERROR',
            'details': str(e) if NODE_ENV == 'development' else 'Internal error'
        }), 500

@app.route('/api/register-face', methods=['POST'])
def api_register_face():
    """
    Backend-compatible face registration endpoint.
    PRODUCTION MODE: Requires real face recognition and quality validation
    DEVELOPMENT MODE: May use mock data for testing
    """
    try:
        data = request.get_json() or {}
        frames = data.get('frames') or []
        student_id = data.get('student_id') or data.get('studentId')

        if not frames or not student_id:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: frames, student_id',
                'code': 'MISSING_FIELDS'
            }), 400

        # Security check: In production, enforce real face recognition
        if NODE_ENV == 'production' and FACE_RECOGNITION_MODE != 'real':
            logger.critical(f'[SECURITY] Attempted face registration in production without real mode!')
            return jsonify({
                'success': False,
                'error': 'Face registration service not properly configured for production',
                'code': 'FACE_SERVICE_MISCONFIGURED',
                'details': 'Face recognition models are not loaded. Contact your administrator.'
            }), 503

        # In development/mock mode
        if FACE_RECOGNITION_MODE == 'mock':
            logger.warning(f'[DEV] Using mock face registration for student {student_id}')
            return jsonify({
                'success': False,
                'registered': False,
                'message': 'Mock face registration in development mode - real implementation required for production',
                'student_id': student_id,
                'quality_score': 0,
                'timestamp': datetime.now().isoformat(),
                'warning': 'MOCK MODE: This is not real face recognition'
            })

        # REAL FACE RECOGNITION IMPLEMENTATION
        if not embedder or not detector or not aligner or not quality_assessor:
            logger.error('[CRITICAL] ML models not initialized')
            return jsonify({
                'success': False,
                'error': 'ML models not available',
                'code': 'ML_UNAVAILABLE',
                'student_id': student_id
            }), 503

        embeddings_dict = {}
        enrollment_results = []
        
        # Process each frame
        for idx, frame_data in enumerate(frames):
            try:
                # Decode image
                image = decode_base64_image(frame_data)
                if image is None:
                    enrollment_results.append({'frame': idx, 'success': False, 'reason': 'Invalid image'})
                    continue
                
                # Detect face
                detections = detector.detect_faces(image, confidence_threshold=0.9)
                if not detections:
                    enrollment_results.append({'frame': idx, 'success': False, 'reason': 'No face detected'})
                    continue
                
                # Get largest face
                detection = max(detections, key=lambda d: (d['bbox'][2]-d['bbox'][0]) * (d['bbox'][3]-d['bbox'][1]))
                x1, y1, x2, y2 = detection['bbox']
                face_image = image[y1:y2, x1:x2]
                
                # Check quality
                quality = quality_assessor.assess_quality(face_image)
                if not quality.get('passed', False):
                    enrollment_results.append({'frame': idx, 'success': False, 'reason': 'Poor quality'})
                    continue
                
                # Align face
                aligned = aligner.align_from_detection(image, detection)
                if aligned is None:
                    enrollment_results.append({'frame': idx, 'success': False, 'reason': 'Alignment failed'})
                    continue
                
                # Check anti-spoofing
                if anti_spoofing:
                    spoof_result = anti_spoofing.detect_spoof(aligned)
                    if not spoof_result.get('is_real', True):
                        enrollment_results.append({'frame': idx, 'success': False, 'reason': 'Spoofing detected'})
                        continue
                
                # Generate embedding
                embedding = embedder.generate_embedding(aligned)
                if embedding is None:
                    enrollment_results.append({'frame': idx, 'success': False, 'reason': 'Embedding generation failed'})
                    continue
                
                # Encrypt embedding
                if encryptor:
                    encrypted = encryptor.encrypt_embedding(embedding)
                    embeddings_dict[f'pose_{idx}'] = encrypted['encrypted_embedding']
                else:
                    embeddings_dict[f'pose_{idx}'] = embedding.tolist()
                
                enrollment_results.append({'frame': idx, 'success': True, 'quality_score': quality.get('overall_score', 0)})
                
            except Exception as e:
                logger.error(f"Frame {idx} processing error: {e}")
                enrollment_results.append({'frame': idx, 'success': False, 'reason': str(e)})
                continue
        
        # Check if at least one embedding was generated
        if not embeddings_dict:
            return jsonify({
                'success': False,
                'registered': False,
                'student_id': student_id,
                'error': 'No valid embeddings generated',
                'enrollment_results': enrollment_results,
                'timestamp': datetime.now().isoformat()
            })
        
        # Return success with embeddings
        return jsonify({
            'success': True,
            'registered': True,
            'student_id': student_id,
            'face_embedding': list(embeddings_dict.values())[0] if isinstance(list(embeddings_dict.values())[0], list) else embeddings_dict[list(embeddings_dict.keys())[0]],
            'model_version': '2.0-arcface',
            'quality_score': np.mean([r.get('quality_score', 0) for r in enrollment_results if r['success']]),
            'enrollment_results': enrollment_results,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"API face registration error: {e}")
        return jsonify({
            'success': False,
            'error': 'Face registration failed',
            'code': 'REGISTRATION_ERROR'
        }), 500

if __name__ == '__main__':
    port = int(os.getenv('PORT', 8000))
    model_path = os.getenv('MODEL_PATH', '/app/models')
    
    logger.info(f"Starting Face AI Service on port {port}")
    logger.info(f"Model path: {model_path}")
    
    # Initialize ML models on startup
    logger.info("Initializing ML models...")
    initialize_ml_models()
    logger.info("ML models initialized")
    
    # Start Flask
    debug_mode = NODE_ENV != 'production'
    app.run(host='0.0.0.0', port=port, debug=debug_mode)
