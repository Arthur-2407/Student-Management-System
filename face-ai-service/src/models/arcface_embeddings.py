"""
ArcFace Embedding Generation Module
Generates 512-dimensional face embeddings using InsightFace ArcFace model
"""

import numpy as np
import logging
import cv2
from typing import Tuple, Optional, List
import os

logger = logging.getLogger(__name__)

try:
    from insightface.app import FaceAnalysis
    INSIGHTFACE_AVAILABLE = True
except ImportError:
    INSIGHTFACE_AVAILABLE = False
    logger.warning("InsightFace not available - install: pip install insightface")


class ArcFaceEmbedder:
    """
    Generates ArcFace embeddings using InsightFace library
    Model: ArcFace with ResNet50 backbone
    Output: 512-dimensional embeddings
    """
    
    def __init__(self, gpu_id: int = 0):
        """
        Initialize ArcFace embedder
        
        Args:
            gpu_id: GPU device ID (0 for GPU, -1 for CPU)
        """
        if not INSIGHTFACE_AVAILABLE:
            raise ImportError("InsightFace not installed. Run: pip install insightface")
        
        try:
            # Initialize FaceAnalysis with buffalo_l model (largest, most accurate)
            self.app = FaceAnalysis(name='buffalo_l', allowed_modules=['detection', 'recognition'])
            self.app.prepare(ctx_id=gpu_id, det_thresh=0.5, det_size=(640, 640))
            logger.info(f"ArcFace embedder initialized (GPU: {gpu_id})")
        except Exception as e:
            logger.error(f"Failed to initialize ArcFace: {e}")
            raise
    
    def generate_embedding(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Generate a single 512-dimensional embedding from a face image
        
        Args:
            image: BGR image array (can be any size)
        
        Returns:
            512-dimensional embedding vector or None if no face detected
        """
        try:
            if image is None or image.size == 0:
                logger.warning("Empty image provided")
                return None
            
            # Detect faces in image
            faces = self.app.get(image)
            
            if len(faces) == 0:
                logger.debug("No faces detected in image")
                return None
            
            if len(faces) > 1:
                logger.debug(f"Multiple faces detected ({len(faces)}), using first")
            
            # Get embedding from first detected face
            face = faces[0]
            embedding = face.embedding
            
            # Verify embedding shape
            if embedding.shape != (512,):
                logger.error(f"Invalid embedding shape: {embedding.shape}")
                return None
            
            # Normalize embedding
            embedding = embedding / np.linalg.norm(embedding)
            
            return embedding.astype(np.float32)
        
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return None
    
    def generate_embeddings_batch(self, images: List[np.ndarray]) -> List[Optional[np.ndarray]]:
        """
        Generate embeddings for multiple images
        
        Args:
            images: List of BGR image arrays
        
        Returns:
            List of embeddings (None for failed images)
        """
        embeddings = []
        for img in images:
            embedding = self.generate_embedding(img)
            embeddings.append(embedding)
        return embeddings
    
    def compare_embeddings(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """
        Compare two embeddings using cosine similarity
        
        Args:
            emb1: First 512-dimensional embedding
            emb2: Second 512-dimensional embedding
        
        Returns:
            Similarity score (0-1, higher = more similar)
        """
        if emb1 is None or emb2 is None:
            return 0.0
        
        # Cosine similarity: dot product of normalized vectors
        similarity = np.dot(emb1, emb2)
        return float(np.clip(similarity, 0, 1))
    
    def compare_with_multiple(self, live_embedding: np.ndarray, 
                             stored_embeddings: dict) -> dict:
        """
        Compare live embedding against multiple stored embeddings
        
        Args:
            live_embedding: Current face embedding
            stored_embeddings: Dict of {pose: embedding} pairs
        
        Returns:
            Similarity scores and matching results
        """
        similarities = {}
        
        for pose, stored_emb in stored_embeddings.items():
            if stored_emb is not None:
                sim = self.compare_embeddings(live_embedding, stored_emb)
                similarities[pose] = sim
        
        if not similarities:
            return {
                'max_similarity': 0.0,
                'avg_similarity': 0.0,
                'median_similarity': 0.0,
                'similarities': {}
            }
        
        sims = list(similarities.values())
        return {
            'max_similarity': float(np.max(sims)),
            'avg_similarity': float(np.mean(sims)),
            'median_similarity': float(np.median(sims)),
            'std_dev': float(np.std(sims)),
            'similarities': similarities,
            'best_match': max(similarities, key=similarities.get)
        }
