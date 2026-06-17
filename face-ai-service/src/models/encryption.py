"""
Embedding Encryption Module
Encrypts and decrypts face embeddings using AES-256-GCM
"""

import os
import json
import base64
import numpy as np
import logging
from typing import Optional, Dict
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2

logger = logging.getLogger(__name__)


class EmbeddingEncryption:
    """
    Encrypts and decrypts embeddings using AES-256-GCM
    """
    
    # Encryption parameters
    KEY_SIZE = 32  # 256 bits
    NONCE_SIZE = 12  # 96 bits (12 bytes)
    TAG_SIZE = 16  # 128 bits (GCM auth tag)
    
    def __init__(self, master_key: Optional[bytes] = None):
        """
        Initialize encryption module
        
        Args:
            master_key: 32-byte master key (256-bit). If None, creates from environment
        """
        if master_key is None:
            # Try to load from environment
            key_env = os.getenv('ENCRYPTION_MASTER_KEY')
            if key_env:
                try:
                    # Decode from base64
                    master_key = base64.b64decode(key_env)
                    if len(master_key) != self.KEY_SIZE:
                        logger.warning(f"Master key has invalid size: {len(master_key)}, expected {self.KEY_SIZE}")
                        master_key = self._generate_key()
                except Exception as e:
                    logger.warning(f"Failed to decode master key from env: {e}")
                    master_key = self._generate_key()
            else:
                logger.info("No master key in environment, generating new one")
                master_key = self._generate_key()
                logger.warning("⚠️ Generated temporary key - in production, provide ENCRYPTION_MASTER_KEY")
        
        # Verify key size
        if len(master_key) != self.KEY_SIZE:
            raise ValueError(f"Master key must be {self.KEY_SIZE} bytes, got {len(master_key)}")
        
        self.master_key = master_key
        logger.info("Encryption module initialized")
    
    @staticmethod
    def _generate_key() -> bytes:
        """Generate a random 256-bit key"""
        return os.urandom(EmbeddingEncryption.KEY_SIZE)
    
    def encrypt_embedding(self, embedding: np.ndarray, key_version: str = "v1") -> Dict:
        """
        Encrypt a face embedding
        
        Args:
            embedding: 512-dimensional embedding vector (numpy array)
            key_version: Version identifier for key rotation
        
        Returns:
            Dict with encrypted data:
            {
                'nonce': base64 string,
                'ciphertext': base64 string,
                'key_version': string,
                'embedding_json': base64 string (before encryption, for reference)
            }
        """
        try:
            # Convert embedding to JSON
            embedding_json = json.dumps(embedding.tolist() if isinstance(embedding, np.ndarray) else embedding)
            plaintext = embedding_json.encode('utf-8')
            
            # Generate random nonce
            nonce = os.urandom(self.NONCE_SIZE)
            
            # Create cipher
            cipher = AESGCM(self.master_key)
            
            # Encrypt (authenticate the entire message)
            ciphertext = cipher.encrypt(nonce, plaintext, None)
            
            # Return encrypted data with nonce prepended
            encrypted_data = nonce + ciphertext  # nonce (12 bytes) + ciphertext + tag (16 bytes)
            
            return {
                'encrypted_embedding': base64.b64encode(encrypted_data).decode('utf-8'),
                'key_version': key_version,
                'size': len(encrypted_data)
            }
        
        except Exception as e:
            logger.error(f"Embedding encryption error: {e}")
            return None
    
    def decrypt_embedding(self, encrypted_data: str, key_version: str = "v1") -> Optional[np.ndarray]:
        """
        Decrypt a face embedding
        
        Args:
            encrypted_data: Base64 encoded encrypted embedding (includes nonce)
            key_version: Version of key used (for future key rotation)
        
        Returns:
            Decrypted 512-dimensional embedding or None if decryption failed
        """
        try:
            # Decode from base64
            encrypted_bytes = base64.b64decode(encrypted_data)
            
            # Split nonce and ciphertext
            if len(encrypted_bytes) < self.NONCE_SIZE:
                logger.error("Invalid encrypted data size")
                return None
            
            nonce = encrypted_bytes[:self.NONCE_SIZE]
            ciphertext = encrypted_bytes[self.NONCE_SIZE:]
            
            # Create cipher and decrypt
            cipher = AESGCM(self.master_key)
            plaintext = cipher.decrypt(nonce, ciphertext, None)
            
            # Parse JSON
            embedding_list = json.loads(plaintext.decode('utf-8'))
            embedding = np.array(embedding_list, dtype=np.float32)
            
            return embedding
        
        except Exception as e:
            logger.error(f"Embedding decryption error: {e}")
            return None
    
    def encrypt_embedding_batch(self, embeddings: Dict[str, np.ndarray]) -> Dict:
        """
        Encrypt multiple embeddings
        
        Args:
            embeddings: Dict of {pose: embedding}
        
        Returns:
            Dict of {pose: encrypted_data}
        """
        encrypted = {}
        for pose, emb in embeddings.items():
            enc = self.encrypt_embedding(emb)
            if enc:
                encrypted[pose] = enc
        return encrypted
    
    def decrypt_embedding_batch(self, encrypted_embeddings: Dict[str, Dict]) -> Dict:
        """
        Decrypt multiple embeddings
        
        Args:
            encrypted_embeddings: Dict of {pose: encrypted_dict}
        
        Returns:
            Dict of {pose: embedding}
        """
        decrypted = {}
        for pose, enc_dict in encrypted_embeddings.items():
            emb = self.decrypt_embedding(enc_dict['encrypted_embedding'])
            if emb is not None:
                decrypted[pose] = emb
        return decrypted
    
    @staticmethod
    def generate_key_env_var() -> str:
        """
        Generate a new key and return it as base64 for ENCRYPTION_MASTER_KEY env var
        """
        key = EmbeddingEncryption._generate_key()
        return base64.b64encode(key).decode('utf-8')
    
    def rotate_key(self, new_key: Optional[bytes] = None):
        """
        Rotate encryption key
        
        Args:
            new_key: New 32-byte key (generates random if None)
        """
        if new_key is None:
            new_key = self._generate_key()
        
        if len(new_key) != self.KEY_SIZE:
            raise ValueError(f"New key must be {self.KEY_SIZE} bytes, got {len(new_key)}")
        
        self.master_key = new_key
        logger.info("Encryption key rotated")
