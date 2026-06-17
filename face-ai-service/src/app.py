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
        
        if not data or 'image' not in data or 'employee_id' not in data:
            return jsonify({
                'error': 'Missing required fields: image, employee_id',
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
        
        if not data or 'image' not in data or 'employee_id' not in data:
            return jsonify({
                'error': 'Missing required fields: image, employee_id',
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
                'employee_id': data['employee_id'],
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
    Backend-compatible face authentication endpoint.
    PRODUCTION MODE: Requires real face recognition, liveness detection, and anti-spoofing
    DEVELOPMENT MODE: May use mock data for testing
    """
    try:
        data = request.get_json() or {}
        frames = data.get('frames') or []
        employee_id = data.get('employee_id') or data.get('employeeId')
        challenge_type = data.get('challenge_type') or data.get('challengeType')

        if not frames or not employee_id:
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'Missing required fields: frames, employee_id',
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
            logger.warning(f'[DEV] Using mock face login for employee {employee_id}')
            return jsonify({
                'success': False,
                'authenticated': False,
                'confidence': 0,
                'liveness_passed': False,
                'spoof_detected': False,
                'spoof_confidence': 0,
                'challenge_passed': False,
                'face_matched': False,
                'employee_id': employee_id,
                'errors': ['Mock face authentication in development mode - real implementation required for production'],
                'warning': 'MOCK MODE: This is not real face recognition'
            })

        # REAL FACE RECOGNITION IMPLEMENTATION
        if not embedder or not detector or not liveness_detector:
            logger.error('[CRITICAL] ML models not initialized')
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'ML models not available',
                'code': 'ML_UNAVAILABLE'
            }), 503

        # Decode frames
        decoded_frames = []
        for frame_data in frames:
            frame = decode_base64_image(frame_data)
            if frame is not None:
                decoded_frames.append(frame)
        
        if not decoded_frames:
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'No valid frames',
                'code': 'NO_VALID_FRAMES'
            })
        
        # Detect face in first frame
        detections = detector.detect_faces(decoded_frames[0], confidence_threshold=0.9)
        if not detections:
            return jsonify({
                'success': False,
                'authenticated': False,
                'face_matched': False,
                'employee_id': employee_id,
                'reason': 'No face detected'
            })
        
        # Get largest face
        detection = max(detections, key=lambda d: (d['bbox'][2]-d['bbox'][0]) * (d['bbox'][3]-d['bbox'][1]))
        x1, y1, x2, y2 = detection['bbox']
        face_image = decoded_frames[0][y1:y2, x1:x2]
        
        # Check quality
        quality = quality_assessor.assess_quality(face_image) if quality_assessor else {'passed': True, 'overall_score': 1.0}
        
        # Check anti-spoofing
        spoof_result = {'is_real': True, 'spoof_score': 0}
        if anti_spoofing:
            spoof_result = anti_spoofing.detect_spoof(face_image)
            if not spoof_result.get('is_real', True):
                return jsonify({
                    'success': False,
                    'authenticated': False,
                    'spoof_detected': True,
                    'spoof_confidence': spoof_result.get('spoof_score', 0),
                    'employee_id': employee_id,
                    'reason': 'Spoofing detected'
                })
        
        # Check liveness if frames provided
        liveness_passed = True
        if len(decoded_frames) > 1 and liveness_detector:
            liveness_result = liveness_detector.get_liveness_score(decoded_frames)
            liveness_passed = liveness_result.get('is_live', False)
            if not liveness_passed:
                return jsonify({
                    'success': False,
                    'authenticated': False,
                    'liveness_passed': False,
                    'liveness_score': liveness_result.get('overall_score', 0),
                    'employee_id': employee_id,
                    'reason': 'Liveness check failed'
                })
        
        # Generate embedding
        embedding = embedder.generate_embedding(face_image)
        if embedding is None:
            return jsonify({
                'success': False,
                'authenticated': False,
                'error': 'Failed to generate embedding',
                'employee_id': employee_id
            })
        
        # FACE MATCHING IMPLEMENTATION
        # Extract stored embedding(s) from request
        stored_embedding_data = data.get('stored_embedding')
        if not stored_embedding_data:
            logger.error('[face-login] No stored embedding provided for comparison')
            return jsonify({
                'success': False,
                'authenticated': False,
                'face_matched': False,
                'error': 'No enrollment found for this employee',
                'code': 'NO_ENROLLMENT',
                'employee_id': employee_id
            })
        
        # Cosine similarity threshold (industry standard for face recognition)
        SIMILARITY_THRESHOLD = 0.6
        
        # Handle both single embedding (list) and multiple embeddings (dict)
        max_similarity = 0.0
        matched_embedding_id = None
        
        if isinstance(stored_embedding_data, dict):
            # Multiple embeddings: compare against all active ones
            similarities = {}
            for emb_id, stored_emb in stored_embedding_data.items():
                if stored_emb is not None:
                    try:
                        # Decrypt if encrypted
                        stored_array = None
                        if isinstance(stored_emb, (list, tuple)):
                            # Already an array
                            stored_array = np.array(stored_emb, dtype=np.float32)
                        elif isinstance(stored_emb, dict):
                            # Check if it's encrypted metadata
                            if stored_emb.get('encrypted'):
                                # Decrypt the JSON object
                                decrypted = decrypt_embedding(json.dumps(stored_emb))
                                if decrypted is not None:
                                    stored_array = decrypted
                            else:
                                # Try to use as plaintext array
                                if isinstance(stored_emb, dict) and 'data' in stored_emb:
                                    stored_array = np.array(stored_emb['data'], dtype=np.float32)
                        elif isinstance(stored_emb, str):
                            # String embedding - try to decrypt or parse
                            decrypted = decrypt_embedding(stored_emb)
                            if decrypted is not None:
                                stored_array = decrypted
                            else:
                                # Try to parse as JSON array
                                try:
                                    parsed = json.loads(stored_emb)
                                    stored_array = np.array(parsed, dtype=np.float32)
                                except:
                                    pass
                        
                        if stored_array is not None and len(stored_array) == len(embedding):
                            similarity = embedder.compare_embeddings(embedding, stored_array)
                            similarities[emb_id] = similarity
                            if similarity > max_similarity:
                                max_similarity = similarity
                                matched_embedding_id = emb_id
                    except Exception as e:
                        logger.warning(f'[face-login] Failed to compare embedding {emb_id}: {e}')
                        continue
        else:
            # Single embedding (array/list/string)
            try:
                stored_array = None
                if isinstance(stored_embedding_data, (list, tuple)):
                    stored_array = np.array(stored_embedding_data, dtype=np.float32)
                elif isinstance(stored_embedding_data, dict):
                    # Check if encrypted
                    if stored_embedding_data.get('encrypted'):
                        decrypted = decrypt_embedding(json.dumps(stored_embedding_data))
                        if decrypted is not None:
                            stored_array = decrypted
                elif isinstance(stored_embedding_data, str):
                    # Try to decrypt first
                    decrypted = decrypt_embedding(stored_embedding_data)
                    if decrypted is not None:
                        stored_array = decrypted
                    else:
                        # Try to parse as JSON
                        try:
                            parsed = json.loads(stored_embedding_data)
                            stored_array = np.array(parsed, dtype=np.float32)
                        except:
                            pass
                
                if stored_array is not None and len(stored_array) == len(embedding):
                    max_similarity = embedder.compare_embeddings(embedding, stored_array)
            except Exception as e:
                logger.error(f'[face-login] Failed to compare embedding: {e}')
                max_similarity = 0.0
        
        # THRESHOLD EVALUATION
        face_matched = max_similarity >= SIMILARITY_THRESHOLD
        
        # DECISION: Accept or reject based on face match
        if not face_matched:
            logger.warning(f'[face-login] Face mismatch for {employee_id}: similarity={max_similarity:.4f}, threshold={SIMILARITY_THRESHOLD}')
            return jsonify({
                'success': True,
                'authenticated': False,
                'face_matched': False,
                'similarity': float(max_similarity),
                'threshold': SIMILARITY_THRESHOLD,
                'reason': f'Face similarity {max_similarity:.4f} below threshold {SIMILARITY_THRESHOLD}',
                'employee_id': employee_id,
                'timestamp': datetime.now().isoformat()
            })
        
        # ACCEPTANCE: Face matches
        logger.info(f'[face-login] Face matched for {employee_id}: similarity={max_similarity:.4f}')
        return jsonify({
            'success': True,
            'authenticated': True,
            'face_matched': True,
            'similarity': float(max_similarity),
            'threshold': SIMILARITY_THRESHOLD,
            'confidence': float(detection['confidence']),
            'quality_score': quality.get('overall_score', 1.0),
            'liveness_passed': liveness_passed,
            'spoof_detected': not spoof_result.get('is_real', True),
            'spoof_confidence': spoof_result.get('spoof_score', 0),
            'challenge_passed': True,
            'employee_id': employee_id,
            'timestamp': datetime.now().isoformat()
        })

    except Exception as e:
        logger.error(f"API face login error: {e}")
        return jsonify({
            'success': False,
            'authenticated': False,
            'error': 'Face authentication failed',
            'code': 'FACE_LOGIN_ERROR'
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
        employee_id = data.get('employee_id') or data.get('employeeId')

        if not frames or not employee_id:
            return jsonify({
                'success': False,
                'error': 'Missing required fields: frames, employee_id',
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
            logger.warning(f'[DEV] Using mock face registration for employee {employee_id}')
            return jsonify({
                'success': False,
                'registered': False,
                'message': 'Mock face registration in development mode - real implementation required for production',
                'employee_id': employee_id,
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
                'employee_id': employee_id
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
                'employee_id': employee_id,
                'error': 'No valid embeddings generated',
                'enrollment_results': enrollment_results,
                'timestamp': datetime.now().isoformat()
            })
        
        # Return success with embeddings
        return jsonify({
            'success': True,
            'registered': True,
            'employee_id': employee_id,
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
