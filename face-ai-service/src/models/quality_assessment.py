"""
Face Quality Assessment Module
Evaluates face image quality before enrollment or verification
"""

import numpy as np
import cv2
import logging
from typing import Dict, Tuple, Optional

logger = logging.getLogger(__name__)


class QualityAssessor:
    """
    Assesses face image quality using multiple metrics
    """
    
    def __init__(self):
        """Initialize quality assessor"""
        logger.info("Quality assessor initialized")
        
        # Quality thresholds (0-1 scale, higher is better)
        self.THRESHOLD_BRIGHTNESS = 0.7
        self.THRESHOLD_SHARPNESS = 0.7
        self.THRESHOLD_FACE_SIZE = 0.7
        self.THRESHOLD_VISIBILITY = 0.7
        self.THRESHOLD_POSE = 0.7
        self.THRESHOLD_OVERALL = 0.7
    
    def assess_quality(self, image: np.ndarray, bbox: Optional[list] = None) -> Dict:
        """
        Assess overall face image quality
        
        Args:
            image: BGR image array
            bbox: Face bounding box [x1, y1, x2, y2] (optional)
        
        Returns:
            Quality assessment with component scores
            {
                'passed': bool,
                'overall_score': float (0-1),
                'scores': {
                    'brightness': float,
                    'sharpness': float,
                    'face_size': float,
                    'visibility': float,
                    'pose': float,
                },
                'issues': [list of quality issues]
            }
        """
        try:
            if image is None or image.size == 0:
                return {
                    'passed': False,
                    'overall_score': 0.0,
                    'issues': ['Empty image']
                }
            
            issues = []
            scores = {}
            
            # Check brightness
            scores['brightness'] = self._check_brightness(image)
            if scores['brightness'] < self.THRESHOLD_BRIGHTNESS:
                issues.append(f"Poor brightness ({scores['brightness']:.2f})")
            
            # Check sharpness
            scores['sharpness'] = self._check_sharpness(image)
            if scores['sharpness'] < self.THRESHOLD_SHARPNESS:
                issues.append(f"Blurry image ({scores['sharpness']:.2f})")
            
            # Check face size (if bbox provided)
            if bbox is not None:
                scores['face_size'] = self._check_face_size(image, bbox)
                if scores['face_size'] < self.THRESHOLD_FACE_SIZE:
                    issues.append(f"Face too small or too large ({scores['face_size']:.2f})")
            else:
                scores['face_size'] = 1.0
            
            # Calculate overall score (average of components)
            overall = np.mean(list(scores.values()))
            passed = overall >= self.THRESHOLD_OVERALL and len(issues) == 0
            
            return {
                'passed': passed,
                'overall_score': float(overall),
                'scores': scores,
                'issues': issues
            }
        
        except Exception as e:
            logger.error(f"Quality assessment error: {e}")
            return {
                'passed': False,
                'overall_score': 0.0,
                'issues': [f"Assessment error: {str(e)}"]
            }
    
    def _check_brightness(self, image: np.ndarray) -> float:
        """
        Check image brightness
        Optimal range: 50-200 (0-255 scale)
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Calculate mean brightness
            brightness = np.mean(gray)
            
            # Score: higher for values in optimal range (50-200)
            if brightness < 30:
                return 0.0
            elif brightness < 50:
                return brightness / 50 * 0.5  # Ramp up from 0 to 0.5
            elif brightness <= 200:
                return 1.0  # Optimal range
            elif brightness <= 230:
                return (230 - brightness) / 30  # Ramp down from 1.0 to 0
            else:
                return 0.0
        
        except Exception as e:
            logger.warning(f"Brightness check error: {e}")
            return 0.5
    
    def _check_sharpness(self, image: np.ndarray) -> float:
        """
        Check image sharpness using Laplacian variance
        Higher variance = sharper image
        """
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Calculate Laplacian variance
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            variance = laplacian.var()
            
            # Normalize: typically sharp images have variance > 100
            # Score ranges 0-1
            if variance < 10:
                return 0.0
            elif variance < 50:
                return variance / 50 * 0.5
            else:
                return min(1.0, variance / 200)  # Saturate at 200
        
        except Exception as e:
            logger.warning(f"Sharpness check error: {e}")
            return 0.5
    
    def _check_face_size(self, image: np.ndarray, bbox: list) -> float:
        """
        Check if face occupies appropriate portion of image
        Optimal: 15-60% of image area
        """
        try:
            img_height, img_width = image.shape[:2]
            img_area = img_height * img_width
            
            x1, y1, x2, y2 = bbox
            face_width = x2 - x1
            face_height = y2 - y1
            face_area = face_width * face_height
            
            ratio = face_area / img_area
            
            # Optimal range: 0.15 to 0.60
            if ratio < 0.10:
                return 0.0
            elif ratio < 0.15:
                return ratio / 0.15 * 0.5  # Ramp up
            elif ratio <= 0.60:
                return 1.0  # Optimal
            elif ratio <= 0.80:
                return (0.80 - ratio) / 0.20  # Ramp down
            else:
                return 0.0
        
        except Exception as e:
            logger.warning(f"Face size check error: {e}")
            return 0.5
    
    def _check_visibility(self, image: np.ndarray, landmarks: Optional[np.ndarray] = None) -> float:
        """
        Check if facial features are visible
        Based on image histogram and contrast
        """
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Calculate contrast
            contrast = np.std(gray)
            
            # Higher contrast = better visibility
            if contrast < 10:
                return 0.0
            elif contrast < 30:
                return contrast / 30
            else:
                return min(1.0, contrast / 100)
        
        except Exception as e:
            logger.warning(f"Visibility check error: {e}")
            return 0.5
    
    def _check_pose(self, image: np.ndarray) -> float:
        """
        Check if face is frontal enough
        Uses simple edge detection to estimate pose
        """
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Calculate horizontal edge symmetry
            height, width = gray.shape
            
            # Left and right halves
            left_half = gray[:, :width//2]
            right_half = gray[:, width//2:]
            
            # Detect edges
            edges_left = cv2.Canny(left_half, 100, 200).sum()
            edges_right = cv2.Canny(right_half, 100, 200).sum()
            
            # Calculate symmetry (0-1, higher = more symmetric/frontal)
            if edges_left + edges_right == 0:
                return 0.5
            
            symmetry = 1 - abs(edges_left - edges_right) / (edges_left + edges_right + 1e-6)
            return float(np.clip(symmetry, 0, 1))
        
        except Exception as e:
            logger.warning(f"Pose check error: {e}")
            return 0.5
    
    def get_quality_requirements(self) -> Dict:
        """
        Get quality requirements
        """
        return {
            'brightness': self.THRESHOLD_BRIGHTNESS,
            'sharpness': self.THRESHOLD_SHARPNESS,
            'face_size': self.THRESHOLD_FACE_SIZE,
            'visibility': self.THRESHOLD_VISIBILITY,
            'pose': self.THRESHOLD_POSE,
            'overall': self.THRESHOLD_OVERALL
        }
