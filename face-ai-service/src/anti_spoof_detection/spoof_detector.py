"""
Anti-Spoof Detection Module
Detects spoofing attempts using texture analysis, screen glare detection, and pattern analysis
"""

import cv2
import numpy as np
from typing import List, Dict
import logging
from scipy import ndimage
from scipy.signal import convolve2d
import pywt

logger = logging.getLogger(__name__)

class SpoofDetector:
    """Detects spoofing attempts through multiple analysis methods"""
    
    def __init__(self):
        # Texture analysis parameters
        self.texture_window_size = 32
        self.texture_threshold = 0.15
        
        # Screen glare parameters
        self.glare_threshold = 0.8
        self.glare_area_ratio = 0.05
        
        # Moire pattern parameters
        self.moire_frequency_range = (0.1, 0.3)
        self.moire_threshold = 0.2
        
        # Color consistency parameters
        self.color_variance_threshold = 0.05
        
        logger.info("Spoof detector initialized")
    
    def detect_spoof(self, face_frames: List[np.ndarray]) -> Dict:
        """
        Detect spoofing attempts in face frames
        
        Args:
            face_frames: List of cropped face images
            
        Returns:
            Dictionary with spoof detection results and confidence
        """
        if not face_frames:
            return {
                "spoof_detected": False,
                "spoof_confidence": 0.0,
                "detection_type": "NO_FRAMES",
                "analysis_results": {}
            }
        
        # Use the clearest frame for analysis
        clearest_frame = self._select_clearest_frame(face_frames)
        
        results = {
            "spoof_detected": False,
            "spoof_confidence": 0.0,
            "detection_type": "NONE",
            "analysis_results": {},
            "individual_scores": {}
        }
        
        try:
            # Run all detection methods
            detection_methods = [
                ("texture_analysis", self._analyze_texture_patterns),
                ("screen_glare", self._detect_screen_glare),
                ("moire_patterns", self._detect_moire_patterns),
                ("color_consistency", self._analyze_color_consistency),
                ("pixel_patterns", self._analyze_pixel_patterns)
            ]
            
            scores = []
            detection_types = []
            
            for method_name, method_func in detection_methods:
                method_result = method_func(clearest_frame)
                results["individual_scores"][method_name] = method_result["score"]
                
                if method_result["detected"]:
                    scores.append(method_result["score"])
                    detection_types.append(method_result["type"])
            
            # Calculate overall spoof confidence
            if scores:
                max_score = max(scores)
                max_idx = scores.index(max_score)
                detection_type = detection_types[max_idx]
                
                results["spoof_detected"] = True
                results["spoof_confidence"] = max_score
                results["detection_type"] = detection_type
                
                logger.warning(f"Spoof detected: {detection_type} with confidence {max_score:.2f}")
            else:
                results["spoof_detected"] = False
                results["spoof_confidence"] = 0.0
                results["detection_type"] = "NONE"
                
                logger.info("No spoof detected")
            
            # Store detailed analysis results
            results["analysis_results"] = {
                "frame_shape": clearest_frame.shape,
                "frame_brightness": np.mean(clearest_frame),
                "frame_contrast": np.std(clearest_frame)
            }
            
        except Exception as e:
            logger.error(f"Spoof detection error: {str(e)}", exc_info=True)
            results["detection_type"] = "ANALYSIS_ERROR"
            results["error"] = str(e)
        
        return results
    
    def _select_clearest_frame(self, frames: List[np.ndarray]) -> np.ndarray:
        """Select the clearest frame based on sharpness"""
        sharpness_scores = []
        
        for frame in frames:
            if len(frame.shape) == 3:
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            else:
                gray = frame
            
            # Calculate Laplacian variance as sharpness measure
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            sharpness = np.var(laplacian)
            sharpness_scores.append(sharpness)
        
        clearest_idx = np.argmax(sharpness_scores)
        return frames[clearest_idx]
    
    def _analyze_texture_patterns(self, image: np.ndarray) -> Dict:
        """Analyze texture patterns for printed photo detection"""
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Resize for consistent analysis
            height, width = gray.shape
            if height > 256 or width > 256:
                gray = cv2.resize(gray, (256, 256))
            
            # Calculate Local Binary Patterns (LBP) for texture analysis
            lbp_image = self._calculate_lbp(gray)
            
            # Calculate texture uniformity
            hist, _ = np.histogram(lbp_image.ravel(), bins=256, range=(0, 256))
            hist = hist.astype("float")
            hist /= (hist.sum() + 1e-7)
            
            # Calculate texture uniformity score
            uniformity = np.sum(hist ** 2)
            
            # Printed photos tend to have more uniform texture
            detected = uniformity > self.texture_threshold
            score = min(uniformity / 0.3, 1.0)  # Normalize score
            
            return {
                "detected": detected,
                "score": score,
                "type": "PRINTED_TEXTURE",
                "uniformity": float(uniformity)
            }
            
        except Exception as e:
            logger.error(f"Texture analysis error: {str(e)}")
            return {
                "detected": False,
                "score": 0.0,
                "type": "TEXTURE_ANALYSIS_ERROR",
                "error": str(e)
            }
    
    def _calculate_lbp(self, image: np.ndarray) -> np.ndarray:
        """Calculate Local Binary Pattern"""
        height, width = image.shape
        lbp = np.zeros((height-2, width-2), dtype=np.uint8)
        
        for i in range(1, height-1):
            for j in range(1, width-1):
                center = image[i, j]
                code = 0
                
                # 8 neighbors
                code |= (image[i-1, j-1] >= center) << 7
                code |= (image[i-1, j] >= center) << 6
                code |= (image[i-1, j+1] >= center) << 5
                code |= (image[i, j+1] >= center) << 4
                code |= (image[i+1, j+1] >= center) << 3
                code |= (image[i+1, j] >= center) << 2
                code |= (image[i+1, j-1] >= center) << 1
                code |= (image[i, j-1] >= center) << 0
                
                lbp[i-1, j-1] = code
        
        return lbp
    
    def _detect_screen_glare(self, image: np.ndarray) -> Dict:
        """Detect screen glare from phone/display screens"""
        try:
            if len(image.shape) == 3:
                hsv = cv2.cvtColor(image, cv2.COLOR_BGR2HSV)
                value_channel = hsv[:,:,2]
            else:
                value_channel = image
            
            # Threshold for bright areas
            _, bright_mask = cv2.threshold(value_channel, 
                                          self.glare_threshold * 255, 
                                          255, 
                                          cv2.THRESH_BINARY)
            
            # Calculate bright area ratio
            bright_pixels = np.sum(bright_mask > 0)
            total_pixels = value_channel.size
            bright_ratio = bright_pixels / total_pixels
            
            # Look for specular highlights pattern
            detected = bright_ratio > self.glare_area_ratio
            score = min(bright_ratio / 0.1, 1.0)  # Normalize score
            
            return {
                "detected": detected,
                "score": score,
                "type": "SCREEN_GLARE",
                "bright_ratio": float(bright_ratio)
            }
            
        except Exception as e:
            logger.error(f"Screen glare detection error: {str(e)}")
            return {
                "detected": False,
                "score": 0.0,
                "type": "GLARE_DETECTION_ERROR",
                "error": str(e)
            }
    
    def _detect_moire_patterns(self, image: np.ndarray) -> Dict:
        """Detect moire patterns from screen captures"""
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Apply Fourier Transform
            f_transform = np.fft.fft2(gray)
            f_shift = np.fft.fftshift(f_transform)
            magnitude_spectrum = 20 * np.log(np.abs(f_shift) + 1)
            
            # Normalize magnitude spectrum
            magnitude_normalized = (magnitude_spectrum - np.min(magnitude_spectrum)) / \
                                  (np.max(magnitude_spectrum) - np.min(magnitude_spectrum) + 1e-7)
            
            # Look for high-frequency patterns
            height, width = magnitude_normalized.shape
            center_y, center_x = height // 2, width // 2
            
            # Create circular mask for frequency analysis
            y, x = np.ogrid[:height, :width]
            dist_from_center = np.sqrt((x - center_x)**2 + (y - center_y)**2)
            
            # Check for patterns in mid-frequency range
            freq_mask = (dist_from_center > self.moire_frequency_range[0] * min(height, width)) & \
                       (dist_from_center < self.moire_frequency_range[1] * min(height, width))
            
            # Calculate average magnitude in frequency range
            avg_magnitude = np.mean(magnitude_normalized[freq_mask])
            
            detected = avg_magnitude > self.moire_threshold
            score = min(avg_magnitude / 0.3, 1.0)  # Normalize score
            
            return {
                "detected": detected,
                "score": score,
                "type": "MOIRE_PATTERN",
                "avg_magnitude": float(avg_magnitude)
            }
            
        except Exception as e:
            logger.error(f"Moire pattern detection error: {str(e)}")
            return {
                "detected": False,
                "score": 0.0,
                "type": "MOIRE_DETECTION_ERROR",
                "error": str(e)
            }
    
    def _analyze_color_consistency(self, image: np.ndarray) -> Dict:
        """Analyze color consistency for printed photo detection"""
        try:
            if len(image.shape) != 3:
                return {
                    "detected": False,
                    "score": 0.0,
                    "type": "NOT_COLOR_IMAGE"
                }
            
            # Convert to LAB color space for better color analysis
            lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
            
            # Calculate variance in each channel
            channel_variances = []
            for i in range(3):
                channel = lab[:,:,i]
                variance = np.var(channel) / 255.0  # Normalize
                channel_variances.append(variance)
            
            # Printed photos often have abnormal color variances
            avg_variance = np.mean(channel_variances)
            
            detected = avg_variance < self.color_variance_threshold
            score = min((self.color_variance_threshold - avg_variance) / self.color_variance_threshold, 1.0)
            score = max(score, 0.0)
            
            return {
                "detected": detected,
                "score": score,
                "type": "COLOR_CONSISTENCY",
                "avg_variance": float(avg_variance)
            }
            
        except Exception as e:
            logger.error(f"Color consistency analysis error: {str(e)}")
            return {
                "detected": False,
                "score": 0.0,
                "type": "COLOR_ANALYSIS_ERROR",
                "error": str(e)
            }
    
    def _analyze_pixel_patterns(self, image: np.ndarray) -> Dict:
        """Analyze pixel patterns for digital screen detection"""
        try:
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Calculate horizontal and vertical gradients
            grad_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            grad_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            
            # Calculate gradient magnitude
            grad_mag = np.sqrt(grad_x**2 + grad_y**2)
            
            # Analyze gradient distribution
            grad_hist, _ = np.histogram(grad_mag.ravel(), bins=50, range=(0, np.max(grad_mag)))
            grad_hist = grad_hist.astype("float")
            grad_hist /= (grad_hist.sum() + 1e-7)
            
            # Calculate entropy of gradient distribution
            entropy = -np.sum(grad_hist * np.log2(grad_hist + 1e-7))
            
            # Digital screens often have specific gradient patterns
            # This is a simplified detection - in practice would use ML
            detected = entropy < 4.0  # Empirical threshold
            score = min((4.0 - entropy) / 2.0, 1.0)
            score = max(score, 0.0)
            
            return {
                "detected": detected,
                "score": score,
                "type": "PIXEL_PATTERN",
                "entropy": float(entropy)
            }
            
        except Exception as e:
            logger.error(f"Pixel pattern analysis error: {str(e)}")
            return {
                "detected": False,
                "score": 0.0,
                "type": "PATTERN_ANALYSIS_ERROR",
                "error": str(e)
            }

# Example usage
if __name__ == "__main__":
    # Test spoof detector
    detector = SpoofDetector()
    
    # Create test image
    test_image = np.random.randint(0, 255, (100, 100, 3), dtype=np.uint8)
    
    # Detect spoof
    results = detector.detect_spoof([test_image])
    print(f"Spoof detected: {results['spoof_detected']}")
    print(f"Spoof confidence: {results['spoof_confidence']:.2f}")
    print(f"Detection type: {results['detection_type']}")
    print(f"Individual scores: {results.get('individual_scores', {})}")