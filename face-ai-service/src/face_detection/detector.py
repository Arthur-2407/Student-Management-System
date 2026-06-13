"""
Face Detection Module using RetinaFace for high-accuracy face detection
"""

import cv2
import numpy as np
from typing import List, Tuple
import logging

# Try to import RetinaFace, fallback to OpenCV if not available
try:
    from retinaface import RetinaFace
except ImportError:
    RetinaFace = None
    logging.warning("RetinaFace not available, falling back to OpenCV face detection")

logger = logging.getLogger(__name__)

class FaceDetector:
    """Face detector using RetinaFace with OpenCV fallback"""
    
    def __init__(self, confidence_threshold: float = 0.8):
        self.confidence_threshold = confidence_threshold
        
        # Initialize OpenCV face detector as fallback
        self.face_cascade = cv2.CascadeClassifier(
            cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
        )
        
        logger.info(f"Face detector initialized with confidence threshold: {confidence_threshold}")
    
    def detect_faces(self, image: np.ndarray) -> Tuple[List[np.ndarray], List[Tuple[int, int, int, int]]]:
        """
        Detect faces in an image and return cropped face regions and bounding boxes
        
        Args:
            image: Input image in BGR format
            
        Returns:
            List of cropped face images and list of bounding boxes (x, y, w, h)
        """
        faces = []
        boxes = []
        
        try:
            if RetinaFace is not None:
                # Use RetinaFace for high-accuracy detection
                detections = RetinaFace.detect_faces(image, threshold=self.confidence_threshold)
                
                for face_id, detection in detections.items():
                    facial_area = detection['facial_area']
                    x1, y1, x2, y2 = facial_area
                    
                    # Extract face region
                    face_img = image[y1:y2, x1:x2]
                    
                    # Resize to standard size if needed
                    if face_img.size > 0:
                        faces.append(face_img)
                        boxes.append((x1, y1, x2 - x1, y2 - y1))
            else:
                # Fallback to OpenCV Haar cascades
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
                detected_faces = self.face_cascade.detectMultiScale(
                    gray, 
                    scaleFactor=1.1, 
                    minNeighbors=5, 
                    minSize=(30, 30)
                )
                
                for (x, y, w, h) in detected_faces:
                    face_img = image[y:y+h, x:x+w]
                    if face_img.size > 0:
                        faces.append(face_img)
                        boxes.append((x, y, w, h))
            
            logger.debug(f"Detected {len(faces)} faces in image")
            
        except Exception as e:
            logger.error(f"Face detection error: {str(e)}", exc_info=True)
        
        return faces, boxes
    
    def detect_single_face(self, image: np.ndarray) -> Tuple[np.ndarray, Tuple[int, int, int, int]]:
        """
        Detect and return the largest face in the image
        
        Args:
            image: Input image in BGR format
            
        Returns:
            Cropped face image and bounding box
        """
        faces, boxes = self.detect_faces(image)
        
        if not faces:
            return None, None
        
        # Return the largest face by area
        largest_idx = np.argmax([w * h for (x, y, w, h) in boxes])
        return faces[largest_idx], boxes[largest_idx]
    
    def validate_face_size(self, face_img: np.ndarray, 
                          min_size: int = 64, 
                          max_size: int = 1024) -> bool:
        """
        Validate that face image meets size requirements
        
        Args:
            face_img: Cropped face image
            min_size: Minimum dimension in pixels
            max_size: Maximum dimension in pixels
            
        Returns:
            Boolean indicating if face size is valid
        """
        if face_img is None:
            return False
        
        height, width = face_img.shape[:2]
        
        if height < min_size or width < min_size:
            logger.warning(f"Face too small: {width}x{height} (min: {min_size})")
            return False
        
        if height > max_size or width > max_size:
            logger.warning(f"Face too large: {width}x{height} (max: {max_size})")
            return False
        
        return True
    
    def preprocess_face(self, face_img: np.ndarray, 
                       target_size: Tuple[int, int] = (160, 160)) -> np.ndarray:
        """
        Preprocess face image for recognition
        
        Args:
            face_img: Input face image
            target_size: Target size for resizing
            
        Returns:
            Preprocessed face image
        """
        try:
            # Resize to target size
            resized = cv2.resize(face_img, target_size)
            
            # Convert to float32 and normalize
            normalized = resized.astype('float32') / 255.0
            
            # Apply histogram equalization for better contrast
            if len(normalized.shape) == 3:
                # Convert to YUV and equalize Y channel
                yuv = cv2.cvtColor(normalized, cv2.COLOR_BGR2YUV)
                yuv[:,:,0] = cv2.equalizeHist((yuv[:,:,0] * 255).astype('uint8')) / 255.0
                normalized = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)
            
            return normalized
            
        except Exception as e:
            logger.error(f"Face preprocessing error: {str(e)}", exc_info=True)
            return None

# Example usage
if __name__ == "__main__":
    # Test the face detector
    detector = FaceDetector()
    
    # Load test image
    test_image = cv2.imread('test_face.jpg')
    
    if test_image is not None:
        faces, boxes = detector.detect_faces(test_image)
        print(f"Detected {len(faces)} faces")
        
        for i, (face, box) in enumerate(zip(faces, boxes)):
            print(f"Face {i+1}: Size {face.shape}, Box {box}")
            
            # Validate size
            if detector.validate_face_size(face):
                print(f"Face {i+1} size is valid")
                
                # Preprocess
                processed = detector.preprocess_face(face)
                print(f"Processed face shape: {processed.shape}")
    else:
        print("Test image not found")