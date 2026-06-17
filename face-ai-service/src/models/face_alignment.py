"""
Face Alignment Module
Aligns detected faces to standard 112x112 orientation for consistent embeddings
"""

import numpy as np
import cv2
import logging
from typing import Tuple, Optional

logger = logging.getLogger(__name__)


class FaceAligner:
    """
    Aligns faces using facial landmarks for consistent embedding generation
    Target size: 112x112 (ArcFace standard)
    """
    
    # Target face size (ArcFace standard)
    TARGET_SIZE = (112, 112)
    
    # Desired eye positions in normalized target image
    # Eyes at ~0.3 height, left at 0.3 width, right at 0.7 width
    TARGET_LEFT_EYE = (0.3 * TARGET_SIZE[0], 0.3 * TARGET_SIZE[1])
    TARGET_RIGHT_EYE = (0.7 * TARGET_SIZE[0], 0.3 * TARGET_SIZE[1])
    
    def __init__(self):
        """Initialize face aligner"""
        logger.info("Face aligner initialized")
    
    def align(self, image: np.ndarray, landmarks: np.ndarray, 
              output_size: Tuple[int, int] = None) -> Optional[np.ndarray]:
        """
        Align face using landmarks
        
        Args:
            image: BGR image array
            landmarks: Facial landmarks (5 points: eyes, nose, mouth)
            output_size: Target output size, default (112, 112)
        
        Returns:
            Aligned 112x112 face image or None if alignment failed
        """
        try:
            if image is None or image.size == 0:
                logger.warning("Empty image provided")
                return None
            
            if landmarks is None or len(landmarks) < 2:
                logger.warning("Invalid landmarks provided")
                return None
            
            output_size = output_size or self.TARGET_SIZE
            
            # Extract eye positions (typically landmarks[0] and [1])
            left_eye = landmarks[0]
            right_eye = landmarks[1]
            
            # Compute angle between eyes
            dy = right_eye[1] - left_eye[1]
            dx = right_eye[0] - left_eye[0]
            angle = np.arctan2(dy, dx) * 180 / np.pi
            
            # Calculate center point
            center_x = (left_eye[0] + right_eye[0]) / 2
            center_y = (left_eye[1] + right_eye[1]) / 2
            center = (center_x, center_y)
            
            # Get rotation matrix
            M = cv2.getRotationMatrix2D(center, angle, scale=1.0)
            
            # Calculate scale based on desired eye distance
            current_eye_distance = np.sqrt(dx**2 + dy**2)
            target_eye_distance = self.TARGET_RIGHT_EYE[0] - self.TARGET_LEFT_EYE[0]
            scale = target_eye_distance / (current_eye_distance + 1e-6)
            
            # Update rotation matrix with scale
            M[0][0] *= scale
            M[1][1] *= scale
            
            # Adjust translation to position eyes correctly in output
            M[0][2] = (output_size[0] / 2) - (center_x * scale * np.cos(angle * np.pi / 180) + 
                                              center_y * scale * np.sin(angle * np.pi / 180))
            M[1][2] = (output_size[1] * 0.3) - (center_x * scale * (-np.sin(angle * np.pi / 180)) + 
                                               center_y * scale * np.cos(angle * np.pi / 180))
            
            # Apply affine transformation
            aligned = cv2.warpAffine(image, M, output_size, 
                                    flags=cv2.INTER_LINEAR, 
                                    borderMode=cv2.BORDER_CONSTANT)
            
            return aligned
        
        except Exception as e:
            logger.error(f"Face alignment error: {e}")
            return None
    
    def align_from_detection(self, image: np.ndarray, detection: dict) -> Optional[np.ndarray]:
        """
        Align face from detection dict
        
        Args:
            image: BGR image
            detection: Detection dict with 'landmarks' key
        
        Returns:
            Aligned face image
        """
        if 'landmarks' not in detection or not detection['landmarks']:
            logger.warning("No landmarks in detection")
            return None
        
        landmarks = np.array(detection['landmarks'])
        return self.align(image, landmarks)
    
    def get_alignment_matrix(self, landmarks: np.ndarray) -> Optional[np.ndarray]:
        """
        Get the affine transformation matrix without applying it
        
        Args:
            landmarks: Facial landmarks
        
        Returns:
            2x3 transformation matrix
        """
        try:
            if landmarks is None or len(landmarks) < 2:
                return None
            
            left_eye = landmarks[0]
            right_eye = landmarks[1]
            
            # Calculate angle
            dy = right_eye[1] - left_eye[1]
            dx = right_eye[0] - left_eye[0]
            angle = np.arctan2(dy, dx) * 180 / np.pi
            
            # Calculate center
            center_x = (left_eye[0] + right_eye[0]) / 2
            center_y = (left_eye[1] + right_eye[1]) / 2
            center = (center_x, center_y)
            
            # Get rotation matrix
            M = cv2.getRotationMatrix2D(center, angle, scale=1.0)
            
            return M
        
        except Exception as e:
            logger.error(f"Error getting alignment matrix: {e}")
            return None
    
    def verify_alignment(self, aligned_image: np.ndarray) -> bool:
        """
        Verify that aligned image is valid
        
        Args:
            aligned_image: Aligned face image
        
        Returns:
            True if image is valid
        """
        if aligned_image is None or aligned_image.size == 0:
            return False
        
        if aligned_image.shape != (112, 112, 3):
            logger.warning(f"Unexpected aligned image shape: {aligned_image.shape}")
            return False
        
        # Check if image is mostly black or white (poor quality)
        mean_val = np.mean(aligned_image)
        if mean_val < 10 or mean_val > 245:
            logger.warning(f"Aligned image may be poor quality (mean: {mean_val})")
            return False
        
        return True
