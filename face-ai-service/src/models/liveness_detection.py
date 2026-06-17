"""
Liveness Detection Module
Detects liveness through blink, head movement, mouth movement, and facial motion
"""

import numpy as np
import cv2
import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    logger.warning("MediaPipe not available - install: pip install mediapipe")


class LivenessDetector:
    """
    Detects liveness using multiple challenges:
    1. Blink detection
    2. Head turn detection
    3. Mouth movement detection
    4. Facial motion detection
    """
    
    def __init__(self):
        """Initialize liveness detector"""
        if not MEDIAPIPE_AVAILABLE:
            logger.warning("MediaPipe not available - liveness detection will be limited")
        
        if MEDIAPIPE_AVAILABLE:
            try:
                self.mp_face_mesh = mp.solutions.face_mesh
                self.face_mesh = self.mp_face_mesh.FaceMesh(
                    max_num_faces=1,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5
                )
                logger.info("Liveness detector initialized with MediaPipe")
            except Exception as e:
                logger.warning(f"Failed to initialize MediaPipe: {e}")
                self.face_mesh = None
        else:
            self.face_mesh = None
        
        # Eye aspect ratio threshold for blink
        self.EAR_THRESHOLD = 0.2
        self.BLINK_FRAMES = 2
        
        # Head pose thresholds (degrees)
        self.HEAD_TURN_THRESHOLD = 30
        
        # Mouth aspect ratio threshold
        self.MAR_THRESHOLD = 0.5
    
    def get_liveness_score(self, frames: List[np.ndarray]) -> Dict:
        """
        Calculate liveness score from a sequence of frames
        
        Args:
            frames: List of RGB/BGR image frames
        
        Returns:
            Liveness score and component results
            {
                'is_live': bool,
                'overall_score': float (0-1),
                'blink_detected': bool,
                'head_turn_detected': bool,
                'mouth_movement_detected': bool,
                'facial_motion_detected': bool,
                'confidence': float
            }
        """
        try:
            if not frames or len(frames) == 0:
                return {
                    'is_live': False,
                    'overall_score': 0.0,
                    'error': 'No frames provided'
                }
            
            if not MEDIAPIPE_AVAILABLE or self.face_mesh is None:
                # Fallback: basic motion detection
                return self._get_liveness_score_basic(frames)
            
            results = {
                'blink_detected': False,
                'head_turn_detected': False,
                'mouth_movement_detected': False,
                'facial_motion_detected': False,
                'faces_detected': 0,
                'frame_count': len(frames)
            }
            
            # Process frames
            landmarks_sequence = []
            for frame in frames:
                # Convert BGR to RGB if needed
                if frame.shape[2] == 3 and frame.dtype == np.uint8:
                    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                else:
                    rgb_frame = frame
                
                # Get face mesh
                mesh_results = self.face_mesh.process(rgb_frame)
                
                if mesh_results.multi_face_landmarks:
                    results['faces_detected'] += 1
                    landmarks = mesh_results.multi_face_landmarks[0].landmark
                    landmarks_sequence.append(landmarks)
                else:
                    landmarks_sequence.append(None)
            
            results['valid_landmarks_frames'] = sum(1 for l in landmarks_sequence if l is not None)
            
            if results['valid_landmarks_frames'] == 0:
                return {
                    'is_live': False,
                    'overall_score': 0.0,
                    'error': 'No face detected in frames'
                }
            
            # Detect blink
            results['blink_detected'] = self._detect_blink(landmarks_sequence)
            
            # Detect head turn
            results['head_turn_detected'] = self._detect_head_turn(landmarks_sequence)
            
            # Detect mouth movement
            results['mouth_movement_detected'] = self._detect_mouth_movement(landmarks_sequence)
            
            # Detect facial motion
            results['facial_motion_detected'] = self._detect_facial_motion(landmarks_sequence)
            
            # Calculate overall score (all challenges should pass for liveness)
            challenges_passed = sum([
                results['blink_detected'],
                results['head_turn_detected'],
                results['mouth_movement_detected'],
                results['facial_motion_detected']
            ])
            
            results['overall_score'] = challenges_passed / 4.0
            results['is_live'] = challenges_passed >= 3  # At least 3 of 4 challenges
            results['confidence'] = results['overall_score']
            
            return results
        
        except Exception as e:
            logger.error(f"Liveness detection error: {e}")
            return {
                'is_live': False,
                'overall_score': 0.0,
                'error': str(e)
            }
    
    def _get_liveness_score_basic(self, frames: List[np.ndarray]) -> Dict:
        """
        Basic liveness detection using frame differences
        Fallback when MediaPipe not available
        """
        if len(frames) < 2:
            return {
                'is_live': False,
                'overall_score': 0.0,
                'error': 'Insufficient frames for liveness detection'
            }
        
        # Calculate frame differences
        diffs = []
        for i in range(1, len(frames)):
            diff = cv2.absdiff(frames[i], frames[i-1])
            motion = np.mean(diff)
            diffs.append(motion)
        
        avg_motion = np.mean(diffs) if diffs else 0
        max_motion = np.max(diffs) if diffs else 0
        
        # Check if there's significant motion
        has_motion = avg_motion > 5 and max_motion > 10
        
        return {
            'is_live': has_motion,
            'overall_score': min(1.0, avg_motion / 50),
            'avg_motion': float(avg_motion),
            'max_motion': float(max_motion),
            'method': 'basic_motion_detection'
        }
    
    def _detect_blink(self, landmarks_sequence: List) -> bool:
        """
        Detect blink (eye closure)
        Eye landmarks: 33, 160, 158, 133, 153, 144
        """
        try:
            blink_frames = 0
            
            for landmarks in landmarks_sequence:
                if landmarks is None:
                    continue
                
                # Calculate Eye Aspect Ratio (EAR)
                ear = self._calculate_eye_aspect_ratio(landmarks)
                
                if ear < self.EAR_THRESHOLD:
                    blink_frames += 1
            
            # Consider blink detected if eyes closed in at least 2 frames
            return blink_frames >= self.BLINK_FRAMES
        
        except Exception as e:
            logger.warning(f"Blink detection error: {e}")
            return False
    
    def _detect_head_turn(self, landmarks_sequence: List) -> bool:
        """
        Detect head turn (30° left or right)
        """
        try:
            head_turns = []
            
            for landmarks in landmarks_sequence:
                if landmarks is None:
                    continue
                
                # Estimate head pose using nose and eye landmarks
                # Nose: 1, Eyes: 33, 263
                nose = np.array([landmarks[1].x, landmarks[1].y])
                left_eye = np.array([landmarks[33].x, landmarks[33].y])
                right_eye = np.array([landmarks[263].x, landmarks[263].y])
                
                # Calculate head rotation
                eye_distance = np.linalg.norm(right_eye - left_eye)
                if eye_distance > 0:
                    nose_offset = nose[0] - (left_eye[0] + right_eye[0]) / 2
                    yaw = np.arcsin(np.clip(nose_offset / eye_distance, -1, 1)) * 180 / np.pi
                else:
                    yaw = 0
                
                head_turns.append(yaw)
            
            if head_turns:
                max_yaw = np.max(np.abs(head_turns))
                return max_yaw > self.HEAD_TURN_THRESHOLD
            
            return False
        
        except Exception as e:
            logger.warning(f"Head turn detection error: {e}")
            return False
    
    def _detect_mouth_movement(self, landmarks_sequence: List) -> bool:
        """
        Detect mouth movement (opening/closing)
        Mouth landmarks: 61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375
        """
        try:
            mouth_states = []
            
            for landmarks in landmarks_sequence:
                if landmarks is None:
                    continue
                
                # Calculate Mouth Aspect Ratio (MAR)
                mar = self._calculate_mouth_aspect_ratio(landmarks)
                
                # Track if mouth is open
                mouth_states.append(mar > self.MAR_THRESHOLD)
            
            if len(mouth_states) < 2:
                return False
            
            # Check if mouth opens and closes
            has_open = any(mouth_states)
            has_closed = not all(mouth_states)
            
            return has_open and has_closed
        
        except Exception as e:
            logger.warning(f"Mouth movement detection error: {e}")
            return False
    
    def _detect_facial_motion(self, landmarks_sequence: List) -> bool:
        """
        Detect overall facial motion/movement
        """
        try:
            if len(landmarks_sequence) < 2:
                return False
            
            motions = []
            
            for i in range(1, len(landmarks_sequence)):
                if landmarks_sequence[i] is None or landmarks_sequence[i-1] is None:
                    continue
                
                # Calculate average landmark movement
                prev_landmarks = np.array([[lm.x, lm.y] for lm in landmarks_sequence[i-1]])
                curr_landmarks = np.array([[lm.x, lm.y] for lm in landmarks_sequence[i]])
                
                motion = np.mean(np.linalg.norm(curr_landmarks - prev_landmarks, axis=1))
                motions.append(motion)
            
            if motions:
                avg_motion = np.mean(motions)
                return avg_motion > 0.01  # Threshold for noticeable motion
            
            return False
        
        except Exception as e:
            logger.warning(f"Facial motion detection error: {e}")
            return False
    
    @staticmethod
    def _calculate_eye_aspect_ratio(landmarks) -> float:
        """
        Calculate Eye Aspect Ratio (EAR)
        EAR = ||p2 - p6|| + ||p3 - p5|| / (2 * ||p1 - p4||)
        """
        try:
            # Eye landmarks
            left_eye_top = np.array([landmarks[159].x, landmarks[159].y])
            left_eye_bottom = np.array([landmarks[145].x, landmarks[145].y])
            left_eye_left = np.array([landmarks[33].x, landmarks[33].y])
            left_eye_right = np.array([landmarks[133].x, landmarks[133].y])
            
            right_eye_top = np.array([landmarks[386].x, landmarks[386].y])
            right_eye_bottom = np.array([landmarks[374].x, landmarks[374].y])
            right_eye_left = np.array([landmarks[362].x, landmarks[362].y])
            right_eye_right = np.array([landmarks[263].x, landmarks[263].y])
            
            # Calculate EAR
            left_ear = (np.linalg.norm(left_eye_top - left_eye_bottom) + 
                       np.linalg.norm(left_eye_left - left_eye_right)) / 2
            right_ear = (np.linalg.norm(right_eye_top - right_eye_bottom) + 
                        np.linalg.norm(right_eye_left - right_eye_right)) / 2
            
            ear = (left_ear + right_ear) / 2
            return float(ear)
        
        except Exception as e:
            logger.warning(f"EAR calculation error: {e}")
            return 1.0
    
    @staticmethod
    def _calculate_mouth_aspect_ratio(landmarks) -> float:
        """
        Calculate Mouth Aspect Ratio (MAR)
        """
        try:
            # Mouth landmarks (simplified)
            mouth_top = np.array([landmarks[13].x, landmarks[13].y])
            mouth_bottom = np.array([landmarks[14].x, landmarks[14].y])
            mouth_left = np.array([landmarks[78].x, landmarks[78].y])
            mouth_right = np.array([landmarks[308].x, landmarks[308].y])
            
            vertical = np.linalg.norm(mouth_top - mouth_bottom)
            horizontal = np.linalg.norm(mouth_left - mouth_right)
            
            if horizontal > 0:
                mar = vertical / horizontal
            else:
                mar = 0
            
            return float(mar)
        
        except Exception as e:
            logger.warning(f"MAR calculation error: {e}")
            return 0.0
