#!/usr/bin/env python3
"""Generate minimal 1x1 pixel frames for mock mode testing"""
import base64
import json
import cv2
import numpy as np

# Create 3 tiny 1x1 pixel frames
frames = []
for i in range(3):
    # Create 1x1 pixel image (BGR format for OpenCV)
    tiny_frame = np.array([[[100 + i*10, 100 + i*10, 100 + i*10]]], dtype=np.uint8)
    
    # Encode as JPEG
    success, encoded = cv2.imencode('.jpg', tiny_frame)
    if success:
        b64 = base64.b64encode(encoded.tobytes()).decode('utf-8')
        frames.append(b64)
        print(f"Frame {i+1} created: {len(encoded.tobytes())} bytes, base64 length: {len(b64)}")
    else:
        print(f"Failed to encode frame {i}")

# Create test embedding
stored_embedding = [0.35] + [0.0] * 127

# Create the payload
payload = {
    'employee_id': '125',
    'frames': frames,
    'stored_embedding': stored_embedding
}

# Save to file
with open('tiny_frames_payload.json', 'w') as f:
    json.dump(payload, f)

print(f"\nPayload created: {len(json.dumps(payload))} bytes")
print("Saved to tiny_frames_payload.json")
print("\nFrames array has", len(frames), "frames")
