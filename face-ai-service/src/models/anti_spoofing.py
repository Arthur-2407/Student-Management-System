"""
Anti-Spoofing Module
Detects spoofing attacks (photos, videos, deepfakes) using CNN
"""

import numpy as np
import cv2
import logging
from typing import Dict, Optional, Tuple
import torch
import torch.nn as nn
import torch.nn.functional as F

logger = logging.getLogger(__name__)


class AntiSpoofingCNN(nn.Module):
    """
    Light-weight CNN for face spoofing detection
    Detects if face is real (live) or spoofed (photo/video/deepfake)
    """
    
    def __init__(self):
        """Initialize anti-spoofing CNN"""
        super(AntiSpoofingCNN, self).__init__()
        
        # Feature extraction layers
        self.conv1 = nn.Conv2d(3, 64, kernel_size=5, padding=2)
        self.bn1 = nn.BatchNorm2d(64)
        
        self.conv2 = nn.Conv2d(64, 128, kernel_size=5, padding=2)
        self.bn2 = nn.BatchNorm2d(128)
        
        self.conv3 = nn.Conv2d(128, 256, kernel_size=5, padding=2)
        self.bn3 = nn.BatchNorm2d(256)
        
        # Classification layers
        self.pool = nn.MaxPool2d(2, 2)
        self.fc1 = nn.Linear(256 * 14 * 14, 512)
        self.fc2 = nn.Linear(512, 2)  # Binary: real (0) or fake (1)
        
        self.dropout = nn.Dropout(0.5)
    
    def forward(self, x):
        """Forward pass"""
        # First block
        x = self.conv1(x)
        x = self.bn1(x)
        x = F.relu(x)
        x = self.pool(x)
        
        # Second block
        x = self.conv2(x)
        x = self.bn2(x)
        x = F.relu(x)
        x = self.pool(x)
        
        # Third block
        x = self.conv3(x)
        x = self.bn3(x)
        x = F.relu(x)
        x = self.pool(x)
        
        # Flatten
        x = x.view(x.size(0), -1)
        
        # Classification
        x = self.fc1(x)
        x = F.relu(x)
        x = self.dropout(x)
        x = self.fc2(x)
        
        return x


class AntiSpoofing:
    """
    Anti-spoofing detector using CNN
    Detects photos, videos, deepfakes, and other spoofing attacks
    """
    
    def __init__(self, model_path: Optional[str] = None, device: str = 'cuda'):
        """
        Initialize anti-spoofing detector
        
        Args:
            model_path: Path to pre-trained model weights
            device: 'cuda' or 'cpu'
        """
        try:
            self.device = device if torch.cuda.is_available() else 'cpu'
            
            # Initialize model
            self.model = AntiSpoofingCNN().to(self.device)
            self.model.eval()
            
            # Load pre-trained weights if available
            if model_path and os.path.exists(model_path):
                try:
                    checkpoint = torch.load(model_path, map_location=self.device)
                    self.model.load_state_dict(checkpoint)
                    logger.info(f"Loaded anti-spoofing model from {model_path}")
                except Exception as e:
                    logger.warning(f"Failed to load model weights: {e}")
            else:
                logger.info("Using untrained anti-spoofing model (for development)")
            
            logger.info(f"Anti-spoofing detector initialized (device: {self.device})")
        
        except Exception as e:
            logger.error(f"Failed to initialize anti-spoofing: {e}")
            self.model = None
    
    def detect_spoof(self, image: np.ndarray) -> Dict:
        """
        Detect if face is spoofed (photo, video, deepfake)
        
        Args:
            image: BGR face image (112x112 or larger)
        
        Returns:
            Detection result
            {
                'is_real': bool,
                'spoof_score': float (0-1, higher = more likely spoof),
                'confidence': float (0-1),
                'spoof_type': str ('real', 'photo', 'video', 'deepfake', 'unknown')
            }
        """
        try:
            if self.model is None:
                return {
                    'is_real': True,  # Default to real if model unavailable
                    'spoof_score': 0.0,
                    'confidence': 0.0,
                    'spoof_type': 'unknown',
                    'note': 'Model not available'
                }
            
            if image is None or image.size == 0:
                return {
                    'is_real': False,
                    'spoof_score': 1.0,
                    'confidence': 1.0,
                    'spoof_type': 'invalid'
                }
            
            # Preprocess image
            processed = self._preprocess(image)
            
            # Forward pass
            with torch.no_grad():
                output = self.model(processed)
                probabilities = F.softmax(output, dim=1)
                
                # prob[0] = real, prob[1] = fake
                prob_real = float(probabilities[0, 0].item())
                prob_fake = float(probabilities[0, 1].item())
            
            # Determine spoof type based on secondary features
            spoof_type = self._classify_spoof_type(image, prob_fake)
            
            return {
                'is_real': prob_real > 0.5,
                'spoof_score': prob_fake,  # 0-1
                'confidence': max(prob_real, prob_fake),
                'spoof_type': spoof_type,
                'prob_real': prob_real,
                'prob_fake': prob_fake
            }
        
        except Exception as e:
            logger.error(f"Spoof detection error: {e}")
            return {
                'is_real': False,
                'spoof_score': 0.5,
                'confidence': 0.0,
                'spoof_type': 'error',
                'error': str(e)
            }
    
    def detect_spoof_batch(self, images: list) -> list:
        """
        Detect spoof in multiple images
        
        Args:
            images: List of BGR images
        
        Returns:
            List of detection results
        """
        results = []
        for image in images:
            results.append(self.detect_spoof(image))
        return results
    
    def _preprocess(self, image: np.ndarray) -> torch.Tensor:
        """
        Preprocess image for CNN
        
        Args:
            image: BGR image
        
        Returns:
            Normalized tensor
        """
        try:
            # Resize to 112x112
            if image.shape[0] != 112 or image.shape[1] != 112:
                image = cv2.resize(image, (112, 112))
            
            # Convert BGR to RGB
            if len(image.shape) == 3 and image.shape[2] == 3:
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Normalize
            image = image.astype(np.float32) / 255.0
            
            # Standard normalization
            mean = np.array([0.485, 0.456, 0.406])
            std = np.array([0.229, 0.224, 0.225])
            image = (image - mean) / std
            
            # Convert to tensor
            tensor = torch.from_numpy(image).permute(2, 0, 1).unsqueeze(0)
            tensor = tensor.to(self.device)
            
            return tensor
        
        except Exception as e:
            logger.error(f"Preprocessing error: {e}")
            # Return dummy tensor
            return torch.zeros(1, 3, 112, 112).to(self.device)
    
    def _classify_spoof_type(self, image: np.ndarray, spoof_score: float) -> str:
        """
        Classify type of spoof based on image features
        """
        try:
            if spoof_score < 0.3:
                return 'real'
            
            # Calculate texture features to distinguish spoof types
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if len(image.shape) == 3 else image
            
            # Calculate sharpness
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            sharpness = laplacian.var()
            
            # Calculate contrast
            contrast = np.std(gray)
            
            # Heuristics for spoof type
            if spoof_score > 0.7:
                if sharpness < 50:
                    return 'photo'  # Photos often have lower high-frequency content
                elif contrast < 30:
                    return 'video'  # Video compression artifacts
                else:
                    return 'deepfake'
            
            return 'unknown'
        
        except Exception as e:
            logger.warning(f"Spoof type classification error: {e}")
            return 'unknown'
    
    def train_mode(self):
        """Set model to training mode"""
        if self.model:
            self.model.train()
    
    def eval_mode(self):
        """Set model to evaluation mode"""
        if self.model:
            self.model.eval()


# Backward compatibility
class SpoofDetector(AntiSpoofing):
    """Alias for AntiSpoofing class"""
    pass


# Import os for model path checking
import os
