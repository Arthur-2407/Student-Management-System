#!/usr/bin/env python3
"""
Face AI Service ML Setup Script
Configures and initializes all ML modules for Phase 8
"""

import os
import sys
import subprocess
import logging
from pathlib import Path

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_python_version():
    """Check Python version >= 3.8"""
    version = sys.version_info
    if version.major < 3 or (version.major == 3 and version.minor < 8):
        logger.error(f"Python 3.8+ required, found {version.major}.{version.minor}")
        return False
    logger.info(f"✓ Python {version.major}.{version.minor}.{version.micro}")
    return True

def check_gpu():
    """Check for CUDA GPU availability"""
    try:
        import torch
        if torch.cuda.is_available():
            logger.info(f"✓ GPU detected: {torch.cuda.get_device_name(0)}")
            logger.info(f"  CUDA Version: {torch.version.cuda}")
            return True
        else:
            logger.warning("⚠ No GPU detected - will use CPU (slower performance)")
            return False
    except Exception as e:
        logger.warning(f"⚠ Could not detect GPU: {e}")
        return False

def install_dependencies():
    """Install required packages"""
    logger.info("\n" + "="*60)
    logger.info("Installing ML dependencies...")
    logger.info("="*60)
    
    requirements_file = Path(__file__).parent / 'requirements_ml.txt'
    
    if not requirements_file.exists():
        logger.error(f"Requirements file not found: {requirements_file}")
        return False
    
    try:
        subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-r', str(requirements_file)],
            check=True,
            capture_output=False
        )
        logger.info("✓ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        logger.error(f"Failed to install dependencies: {e}")
        return False

def verify_ml_modules():
    """Verify all ML modules can be imported"""
    logger.info("\n" + "="*60)
    logger.info("Verifying ML modules...")
    logger.info("="*60)
    
    modules = [
        'models.arcface_embeddings',
        'models.face_detection',
        'models.face_alignment',
        'models.quality_assessment',
        'models.liveness_detection',
        'models.anti_spoofing',
        'models.encryption',
    ]
    
    sys.path.insert(0, str(Path(__file__).parent / 'src'))
    
    all_ok = True
    for module in modules:
        try:
            __import__(module)
            logger.info(f"✓ {module}")
        except ImportError as e:
            logger.warning(f"⚠ {module}: {e}")
            all_ok = False
    
    return all_ok

def generate_encryption_key():
    """Generate and display encryption key"""
    logger.info("\n" + "="*60)
    logger.info("Encryption Key Setup")
    logger.info("="*60)
    
    try:
        sys.path.insert(0, str(Path(__file__).parent / 'src'))
        from models.encryption import EmbeddingEncryption
        
        key = EmbeddingEncryption.generate_key_env_var()
        
        logger.info("\n⚠️  NEW ENCRYPTION KEY GENERATED")
        logger.info("Add this to your environment variables:\n")
        logger.info(f"ENCRYPTION_MASTER_KEY={key}\n")
        logger.info("Store this key securely. Losing it will make encrypted embeddings unreadable.")
        
        # Offer to save to .env file
        env_file = Path(__file__).parent / '.env'
        if not env_file.exists():
            try:
                with open(env_file, 'a') as f:
                    f.write(f"\nENCRYPTION_MASTER_KEY={key}\n")
                logger.info(f"✓ Key saved to {env_file}")
            except Exception as e:
                logger.warning(f"Could not save to .env: {e}")
        
        return True
    except Exception as e:
        logger.error(f"Failed to generate encryption key: {e}")
        return False

def download_ml_models():
    """Download required ML models"""
    logger.info("\n" + "="*60)
    logger.info("Downloading ML Models (this may take 5-10 minutes)...")
    logger.info("="*60)
    
    try:
        sys.path.insert(0, str(Path(__file__).parent / 'src'))
        
        # Initialize models to trigger downloads
        logger.info("\nInitializing ArcFace embedder (buffalo_l model)...")
        from models.arcface_embeddings import ArcFaceEmbedder
        embedder = ArcFaceEmbedder(gpu_id=-1)  # Use CPU for download
        logger.info("✓ ArcFace model downloaded")
        
        logger.info("\nInitializing Face detector...")
        from models.face_detection import FaceDetector
        detector = FaceDetector(gpu_id=-1)
        logger.info("✓ Face detection model downloaded")
        
        logger.info("\nInitializing Liveness detector (requires MediaPipe)...")
        from models.liveness_detection import LivenessDetector
        liveness = LivenessDetector()
        logger.info("✓ MediaPipe models ready")
        
        logger.info("\n✓ All ML models initialized successfully")
        return True
    
    except Exception as e:
        logger.error(f"Failed to initialize ML models: {e}")
        logger.info("\nTroubleshooting:")
        logger.info("1. Ensure you have 4GB+ free disk space")
        logger.info("2. Check internet connection")
        logger.info("3. Try: pip install --upgrade insightface")
        return False

def run_integration_test():
    """Run basic integration test"""
    logger.info("\n" + "="*60)
    logger.info("Running Integration Test...")
    logger.info("="*60)
    
    try:
        import cv2
        import numpy as np
        sys.path.insert(0, str(Path(__file__).parent / 'src'))
        
        from models.quality_assessment import QualityAssessor
        
        # Create a test image
        logger.info("\nCreating test image...")
        test_image = np.ones((112, 112, 3), dtype=np.uint8) * 100
        
        # Test quality assessment
        logger.info("Testing quality assessment...")
        assessor = QualityAssessor()
        quality = assessor.assess_quality(test_image)
        
        if quality:
            logger.info(f"✓ Quality assessment works")
            logger.info(f"  Overall score: {quality.get('overall_score', 0):.2f}")
        else:
            logger.error("Quality assessment failed")
            return False
        
        # Test encryption
        logger.info("Testing encryption...")
        from models.encryption import EmbeddingEncryption
        
        encryptor = EmbeddingEncryption()
        test_embedding = np.random.randn(512).astype(np.float32)
        
        encrypted = encryptor.encrypt_embedding(test_embedding)
        if encrypted:
            logger.info("✓ Encryption works")
            
            decrypted = encryptor.decrypt_embedding(encrypted['encrypted_embedding'])
            if decrypted is not None:
                # Check if decrypted matches original
                mse = np.mean((test_embedding - decrypted) ** 2)
                if mse < 1e-6:
                    logger.info(f"✓ Decryption works (MSE: {mse:.2e})")
                else:
                    logger.warning(f"⚠ Decryption MSE high: {mse:.2e}")
            else:
                logger.error("Decryption failed")
                return False
        else:
            logger.error("Encryption failed")
            return False
        
        logger.info("\n✓ All integration tests passed!")
        return True
    
    except Exception as e:
        logger.error(f"Integration test failed: {e}")
        return False

def print_summary(results):
    """Print setup summary"""
    logger.info("\n" + "="*60)
    logger.info("SETUP SUMMARY")
    logger.info("="*60)
    
    status = "✓ SUCCESS" if all(results.values()) else "⚠ PARTIAL"
    logger.info(f"\nStatus: {status}\n")
    
    for check, result in results.items():
        symbol = "✓" if result else "✗"
        logger.info(f"{symbol} {check}")
    
    logger.info("\n" + "="*60)
    logger.info("NEXT STEPS")
    logger.info("="*60)
    logger.info("\n1. Start the Face AI service:")
    logger.info("   python src/app_ml.py")
    logger.info("\n2. Test the health endpoint:")
    logger.info("   curl http://localhost:8000/health")
    logger.info("\n3. Check service info:")
    logger.info("   curl http://localhost:8000/info")
    logger.info("\n4. Integration with backend:")
    logger.info("   Update face-management module to use new endpoints")
    logger.info("\n" + "="*60)

def main():
    """Run full setup"""
    logger.info("\n" + "="*70)
    logger.info("FACE AI SERVICE - ML SETUP")
    logger.info("Phase 8 Implementation")
    logger.info("="*70)
    
    results = {}
    
    # Check Python
    logger.info("\nStep 1: Checking environment...")
    results['Python 3.8+'] = check_python_version()
    
    # Check GPU
    logger.info("\nStep 2: Checking GPU...")
    results['GPU Available'] = check_gpu()
    
    # Install dependencies
    logger.info("\nStep 3: Installing dependencies...")
    results['Dependencies Installed'] = install_dependencies()
    
    # Verify modules
    logger.info("\nStep 4: Verifying ML modules...")
    results['ML Modules Verified'] = verify_ml_modules()
    
    # Generate encryption key
    logger.info("\nStep 5: Setting up encryption...")
    results['Encryption Key Generated'] = generate_encryption_key()
    
    # Download models
    logger.info("\nStep 6: Downloading ML models...")
    results['ML Models Downloaded'] = download_ml_models()
    
    # Run integration test
    logger.info("\nStep 7: Running integration test...")
    results['Integration Tests'] = run_integration_test()
    
    # Print summary
    print_summary(results)
    
    # Return exit code
    return 0 if all(results.values()) else 1

if __name__ == '__main__':
    sys.exit(main())
