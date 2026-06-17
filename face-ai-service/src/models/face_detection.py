"""
RetinaFace Face Detection Module
Detects faces and extracts facial landmarks
"""

import numpy as np
import logging
import cv2
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)

try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    logger.warning("InsightFace not available - install: pip install insightface")


class FaceDetector:
    """
    Detects faces and extracts landmarks using RetinaFace
    Part of InsightFace package
    """
    
    def __init__(self, gpu_id: int = 0):
        """
        Initialize face detector
        
        Args:
            gpu_id: GPU device ID (0 for GPU, -1 for CPU)
        """
        if not INSIGHTFACE_AVAILABLE:
            raise ImportError("InsightFace not installed. Run: pip install insightface")
        
        try:
            # Initialize with detection module only
            self.app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection'])
            self.app.prepare(ctx_id=gpu_id, det_thresh=0.5, det_size=(640, 640))
            logger.info(f"Face detector initialized (GPU: {gpu_id})")
        except Exception as e:
            logger.error(f"Failed to initialize face detector: {e}")
            raise
    
    def detect_faces(self, image: np.ndarray, confidence_threshold: float = 0.9) -> List[Dict]:
        """
        Detect faces in image and extract landmarks
        
        Args:
            image: BGR image array (any size)
            confidence_threshold: Minimum confidence score (0-1)
        
        Returns:
            List of detected faces with landmarks and bounding boxes
            [{
                'bbox': [x1, y1, x2, y2],
                'confidence': float,
                'landmarks': [[x,y], [x,y], ...],  # 5 landmarks
                'kps': numpy array of landmarks
            }, ...]
        """
        try:
            if image is None or image.size == 0:
                logger.warning("Empty image provided")
                return []
            
            # Detect faces
            faces = self.app.get(image)
            
            # Filter by confidence
            detected = []
            for face in faces:
                if face.det_score >= confidence_threshold:
                    bbox = face.bbox.astype(int)  # [x1, y1, x2, y2]
                    
                    detected.append({
                        'bbox': [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])],
                        'confidence': float(face.det_score),
                        'landmarks': self._extract_landmarks(face),
                        'kps': face.kps,  # Raw keypoints
                        'face_obj': face
                    })
            
            logger.debug(f"Detected {len(detected)} faces (confidence >= {confidence_threshold})")
            return detected
        
        except Exception as e:
            logger.error(f"Face detection error: {e}")
            return []
    
    def _extract_landmarks(self, face) -> List[List[float]]:
        """
        Extract 5 facial landmarks from face object
        Landmarks: left_eye, right_eye, nose, left_mouth, right_mouth
        """
        landmarks = []
        if hasattr(face, 'kps') and face.kps is not None:
            for kp in face.kps:
                landmarks.append([float(kp[0]), float(kp[1])])
        return landmarks
    
    def get_face_count(self, image: np.ndarray) -> int:
        """Get count of detected faces"""
        return len(self.detect_faces(image))
    
    def has_multiple_faces(self, image: np.ndarray) -> bool:
        """Check if image contains multiple faces"""
        return self.get_face_count(image) > 1
    
    def get_largest_face(self, image: np.ndarray) -> Optional[Dict]:
        """Get largest face by area"""
        faces = self.detect_faces(image)
        if not faces:
            return None
        
        # Calculate face areas
        largest = max(faces, key=lambda f: (f['bbox'][2]-f['bbox'][0]) * (f['bbox'][3]-f['bbox'][1]))
        return largest
    
    def draw_detections(self, image: np.ndarray, faces: List[Dict]) -> np.ndarray:
        """
        Draw face detections on image for visualization
        
        Args:
            image: BGR image
            faces: List of detected faces
        
        Returns:
            Image with drawn detections
        """
        result = image.copy()
        
        for face in faces:
            bbox = face['bbox']
            confidence = face['confidence']
            
            # Draw bounding box
            cv2.rectangle(result, (bbox[0], bbox[1]), (bbox[2], bbox[3]), 
                         (0, 255, 0), 2)
            
            # Draw confidence
            text = f"Conf: {confidence:.2f}"
            cv2.putText(result, text, (bbox[0], bbox[1]-5),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)
            
            # Draw landmarks
            for lm in face['landmarks']:
                cv2.circle(result, (int(lm[0]), int(lm[1])), 2, (0, 0, 255), -1)
        
        return result
