"""
Multi-Frame Liveness Detection Module
Detects live faces by analyzing blink frequency, head movement, and facial depth cues
"""

import cv2
import numpy as np
from typing import List, Dict, Tuple
import logging
from scipy import signal
from scipy.spatial import distance
import mediapipe as mp

logger = logging.getLogger(__name__)

class LivenessDetector:
    """Detects liveness through multi-frame analysis"""
    
    def __init__(self):
        # Initialize MediaPipe Face Mesh for facial landmarks
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        )
        
        # Eye landmarks indices (MediaPipe)
        self.LEFT_EYE_INDICES = list(range(33, 161))
        self.RIGHT_EYE_INDICES = list(range(362, 471))
        
        # Blink detection parameters
        self.EYE_AR_THRESHOLD = 0.25
        self.EYE_AR_CONSEC_FRAMES = 2
        
        # Head movement parameters
        self.HEAD_MOVEMENT_THRESHOLD = 0.02
        
        logger.info("Liveness detector initialized")
    
    def analyze_liveness(self, face_frames: List[np.ndarray]) -> Dict:
        """
        Analyze multiple frames for liveness detection
        
        Args:
            face_frames: List of cropped face images
            
        Returns:
            Dictionary with liveness confidence and analysis results
        """
        if len(face_frames) < 3:
            return {
                "confidence": 0.0,
                "blink_detected": False,
                "head_movement_detected": False,
                "depth_variation_detected": False,
                "reasons": ["Insufficient frames for liveness analysis"]
            }
        
        results = {
            "confidence": 0.0,
            "blink_detected": False,
            "head_movement_detected": False,
            "depth_variation_detected": False,
            "eye_aspect_ratios": [],
            "head_positions": [],
            "reasons": []
        }
        
        try:
            # Analyze each frame
            for frame in face_frames:
                # Convert BGR to RGB for MediaPipe
                rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                
                # Process with MediaPipe
                results_mp = self.face_mesh.process(rgb_frame)
                
                if results_mp.multi_face_landmarks:
                    landmarks = results_mp.multi_face_landmarks[0]
                    
                    # Calculate eye aspect ratio
                    ear = self._calculate_eye_aspect_ratio(landmarks)
                    results["eye_aspect_ratios"].append(ear)
                    
                    # Calculate head position
                    head_pos = self._calculate_head_position(landmarks)
                    results["head_positions"].append(head_pos)
                else:
                    results["eye_aspect_ratios"].append(0.0)
                    results["head_positions"].append((0.0, 0.0, 0.0))
            
            # Analyze blink patterns
            blink_analysis = self._analyze_blink_pattern(results["eye_aspect_ratios"])
            results["blink_detected"] = blink_analysis["blink_detected"]
            results["blink_count"] = blink_analysis["blink_count"]
            
            # Analyze head movement
            head_movement = self._analyze_head_movement(results["head_positions"])
            results["head_movement_detected"] = head_movement["movement_detected"]
            results["head_movement_magnitude"] = head_movement["movement_magnitude"]
            
            # Analyze depth variation (simulated)
            depth_variation = self._analyze_depth_variation(face_frames)
            results["depth_variation_detected"] = depth_variation["variation_detected"]
            results["depth_variation_score"] = depth_variation["variation_score"]
            
            # Calculate overall confidence
            confidence = self._calculate_confidence(
                blink_analysis,
                head_movement,
                depth_variation
            )
            
            results["confidence"] = confidence
            
            # Add reasons for low confidence
            if confidence < 0.7:
                if not blink_analysis["blink_detected"]:
                    results["reasons"].append("No blink detected")
                if not head_movement["movement_detected"]:
                    results["reasons"].append("Insufficient head movement")
                if not depth_variation["variation_detected"]:
                    results["reasons"].append("Suspicious depth pattern")
            
            logger.info(f"Liveness analysis complete: confidence={confidence:.2f}, "
                       f"blinks={blink_analysis['blink_count']}, "
                       f"head_movement={head_movement['movement_magnitude']:.4f}")
            
        except Exception as e:
            logger.error(f"Liveness analysis error: {str(e)}", exc_info=True)
            results["reasons"].append(f"Analysis error: {str(e)}")
        
        return results
    
    def _calculate_eye_aspect_ratio(self, landmarks) -> float:
        """Calculate Eye Aspect Ratio (EAR) for blink detection"""
        try:
            # Get left eye landmarks
            left_eye_points = []
            for idx in self.LEFT_EYE_INDICES[:6]:  # Use first 6 points for simplicity
                point = landmarks.landmark[idx]
                left_eye_points.append((point.x, point.y))
            
            # Get right eye landmarks
            right_eye_points = []
            for idx in self.RIGHT_EYE_INDICES[:6]:
                point = landmarks.landmark[idx]
                right_eye_points.append((point.x, point.y))
            
            # Calculate EAR for both eyes
            left_ear = self._eye_aspect_ratio_single(left_eye_points)
            right_ear = self._eye_aspect_ratio_single(right_eye_points)
            
            # Average EAR
            return (left_ear + right_ear) / 2.0
            
        except Exception as e:
            logger.error(f"EAR calculation error: {str(e)}")
            return 0.0
    
    def _eye_aspect_ratio_single(self, eye_points: List[Tuple[float, float]]) -> float:
        """Calculate EAR for a single eye"""
        if len(eye_points) < 6:
            return 0.0
        
        # Compute vertical distances
        A = distance.euclidean(eye_points[1], eye_points[5])
        B = distance.euclidean(eye_points[2], eye_points[4])
        
        # Compute horizontal distance
        C = distance.euclidean(eye_points[0], eye_points[3])
        
        # Eye aspect ratio
        ear = (A + B) / (2.0 * C)
        return ear
    
    def _calculate_head_position(self, landmarks):
        """Calculate approximate head position from landmarks"""
        try:
            # Use nose tip and eye corners for position estimation
            nose_tip = landmarks.landmark[1]  # Nose tip
            left_eye = landmarks.landmark[33]  # Left eye corner
            right_eye = landmarks.landmark[263]  # Right eye corner
            
            # Calculate center point
            center_x = (nose_tip.x + left_eye.x + right_eye.x) / 3.0
            center_y = (nose_tip.y + left_eye.y + right_eye.y) / 3.0
            
            # Estimate depth (z-coordinate) based on eye distance
            eye_distance = abs(left_eye.x - right_eye.x)
            
            return (center_x, center_y, eye_distance)
            
        except Exception as e:
            logger.error(f"Head position calculation error: {str(e)}")
            return (0.0, 0.0, 0.0)
    
    def _analyze_blink_pattern(self, ear_values: List[float]) -> Dict:
        """Analyze blink pattern from EAR values"""
        if len(ear_values) < 5:
            return {
                "blink_detected": False,
                "blink_count": 0,
                "blink_frequency": 0.0
            }
        
        blink_count = 0
        blink_frames = 0
        
        # Detect blinks based on EAR threshold
        for i in range(1, len(ear_values) - 1):
            # Check if EAR drops below threshold
            if (ear_values[i] < self.EYE_AR_THRESHOLD and 
                ear_values[i-1] >= self.EYE_AR_THRESHOLD):
                
                # Check consecutive frames
                consecutive_low = 0
                for j in range(i, min(i + 5, len(ear_values))):
                    if ear_values[j] < self.EYE_AR_THRESHOLD:
                        consecutive_low += 1
                    else:
                        break
                
                if consecutive_low >= self.EYE_AR_CONSEC_FRAMES:
                    blink_count += 1
                    blink_frames += consecutive_low
        
        # Calculate blink frequency (blinks per second, assuming 30fps)
        total_frames = len(ear_values)
        blink_frequency = (blink_count / total_frames) * 30  # Convert to blinks per second
        
        return {
            "blink_detected": blink_count > 0,
            "blink_count": blink_count,
            "blink_frequency": blink_frequency
        }
    
    def _analyze_head_movement(self, head_positions: List[Tuple]) -> Dict:
        """Analyze head movement from position data"""
        if len(head_positions) < 3:
            return {
                "movement_detected": False,
                "movement_magnitude": 0.0
            }
        
        # Calculate movement magnitude
        movements = []
        for i in range(1, len(head_positions)):
            dx = head_positions[i][0] - head_positions[i-1][0]
            dy = head_positions[i][1] - head_positions[i-1][1]
            dz = head_positions[i][2] - head_positions[i-1][2]
            
            movement = np.sqrt(dx*dx + dy*dy + dz*dz)
            movements.append(movement)
        
        avg_movement = np.mean(movements) if movements else 0.0
        
        return {
            "movement_detected": avg_movement > self.HEAD_MOVEMENT_THRESHOLD,
            "movement_magnitude": avg_movement
        }
    
    def _analyze_depth_variation(self, face_frames: List[np.ndarray]) -> Dict:
        """Analyze depth variation through image analysis"""
        if len(face_frames) < 3:
            return {
                "variation_detected": False,
                "variation_score": 0.0
            }
        
        try:
            # Convert to grayscale
            gray_frames = [cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY) for frame in face_frames]
            
            # Calculate focus variation (simulating depth changes)
            focus_scores = []
            for gray in gray_frames:
                # Use Laplacian variance as focus measure
                laplacian = cv2.Laplacian(gray, cv2.CV_64F)
                focus_score = np.var(laplacian)
                focus_scores.append(focus_score)
            
            # Normalize focus scores
            if len(focus_scores) > 1:
                focus_range = max(focus_scores) - min(focus_scores)
                avg_focus = np.mean(focus_scores)
                
                # Variation score based on range relative to average
                if avg_focus > 0:
                    variation_score = focus_range / avg_focus
                else:
                    variation_score = 0.0
            else:
                variation_score = 0.0
            
            # Real faces should have some focus variation
            variation_detected = variation_score > 0.05
            
            return {
                "variation_detected": variation_detected,
                "variation_score": variation_score
            }
            
        except Exception as e:
            logger.error(f"Depth variation analysis error: {str(e)}")
            return {
                "variation_detected": False,
                "variation_score": 0.0
            }
    
    def _calculate_confidence(self, blink_analysis: Dict, 
                            head_movement: Dict, 
                            depth_variation: Dict) -> float:
        """Calculate overall liveness confidence"""
        confidence = 0.0
        weights = {
            "blink": 0.4,
            "head_movement": 0.3,
            "depth_variation": 0.3
        }
        
        # Blink confidence
        if blink_analysis["blink_detected"]:
            blink_confidence = min(blink_analysis["blink_count"] / 3.0, 1.0)
        else:
            blink_confidence = 0.1  # Small chance of no blink in short sequence
        
        # Head movement confidence
        if head_movement["movement_detected"]:
            movement_confidence = min(head_movement["movement_magnitude"] / 0.05, 1.0)
        else:
            movement_confidence = 0.1
        
        # Depth variation confidence
        if depth_variation["variation_detected"]:
            depth_confidence = min(depth_variation["variation_score"] / 0.15, 1.0)
        else:
            depth_confidence = 0.1
        
        # Weighted sum
        confidence = (
            blink_confidence * weights["blink"] +
            movement_confidence * weights["head_movement"] +
            depth_confidence * weights["depth_variation"]
        )
        
        return min(max(confidence, 0.0), 1.0)

# Example usage
if __name__ == "__main__":
    # Test liveness detector
    detector = LivenessDetector()
    
    # Load test frames
    test_frames = []
    for i in range(10):
        # In practice, load actual video frames
        # For testing, create dummy frames
        dummy_frame = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
        test_frames.append(dummy_frame)
    
    # Analyze liveness
    results = detector.analyze_liveness(test_frames)
    print(f"Liveness confidence: {results['confidence']:.2f}")
    print(f"Blink detected: {results['blink_detected']}")
    print(f"Head movement detected: {results['head_movement_detected']}")
    print(f"Depth variation detected: {results['depth_variation_detected']}")
    print(f"Reasons: {results.get('reasons', [])}")