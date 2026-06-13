#!/usr/bin/env python3
"""
Mock Face AI Service for Development
Simulates the face recognition API without requiring actual ML models
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import time
import random
import base64
from datetime import datetime

app = Flask(__name__)
CORS(app, origins=["http://localhost:3000", "http://localhost:3001"])

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().isoformat(),
        'service': 'mock-face-ai-service',
        'version': '1.0.0'
    })

@app.route('/face/detect', methods=['POST'])
def face_detect():
    """Mock face detection endpoint"""
    return jsonify({
        'faces_detected': random.randint(1, 3),
        'confidence': round(random.uniform(0.85, 0.99), 3),
        'bounding_boxes': [
            {'x': 100, 'y': 100, 'width': 200, 'height': 200}
        ]
    })

@app.route('/face/verify', methods=['POST'])
def face_verify():
    """Mock face verification endpoint"""
    # Simulate processing time
    time.sleep(random.uniform(0.5, 2.0))
    
    # Randomly succeed or fail for testing
    success = random.random() > 0.2  # 80% success rate
    
    return jsonify({
        'verified': success,
        'confidence': round(random.uniform(0.85, 0.99), 3) if success else round(random.uniform(0.1, 0.4), 3),
        'employee_id': f'EMP{random.randint(100, 999)}' if success else None,
        'match_score': round(random.uniform(0.85, 0.99), 3) if success else round(random.uniform(0.1, 0.4), 3),
        'liveness_detected': success,
        'anti_spoof_passed': success,
        'processing_time': round(random.uniform(0.5, 2.0), 3)
    })

@app.route('/face/register', methods=['POST'])
def face_register():
    """Mock face registration endpoint"""
    time.sleep(random.uniform(1.0, 3.0))
    
    return jsonify({
        'registered': True,
        'employee_id': f'EMP{random.randint(100, 999)}',
        'face_id': f'face_{random.randint(1000, 9999)}',
        'quality_score': round(random.uniform(0.8, 0.95), 3),
        'processing_time': round(random.uniform(1.0, 3.0), 3)
    })

@app.route('/face/liveness', methods=['POST'])
def liveness_check():
    """Mock liveness detection endpoint"""
    time.sleep(random.uniform(0.3, 1.0))
    
    return jsonify({
        'live': random.random() > 0.1,  # 90% pass rate
        'confidence': round(random.uniform(0.8, 0.99), 3),
        'challenge_completed': random.choice(['blink', 'smile', 'turn_head']),
        'processing_time': round(random.uniform(0.3, 1.0), 3)
    })

@app.route('/info', methods=['GET'])
def service_info():
    return jsonify({
        'service': 'Mock Face AI Service',
        'version': '1.0.0',
        'endpoints': [
            'GET /health - Service health check',
            'POST /face/detect - Detect faces in image',
            'POST /face/verify - Verify face against database',
            'POST /face/register - Register new face',
            'POST /face/liveness - Liveness detection'
        ],
        'capabilities': [
            'Face detection',
            'Face verification',
            'Face registration',
            'Liveness detection',
            'Anti-spoofing'
        ]
    })

if __name__ == '__main__':
    print("[Face AI] Mock Face AI Service starting...")
    print("[Face AI] Service will be available at http://localhost:8000")
    print("[Face AI] This is a development mock service")
    
    app.run(host='0.0.0.0', port=8000, debug=True)
