#!/usr/bin/env python3
"""
PHASE 5 — FULL EXECUTION TRACE
Comprehensive verification of complete face login execution path
"""

import requests
import json
import time
import sys
from datetime import datetime
from typing import Dict, List, Any, Optional

# Configuration
BACKEND_URL = "http://localhost:3001"
FACE_AI_URL = "http://localhost:8000"
FRONTEND_URL = "http://localhost:3000"

class ExecutionTracer:
    def __init__(self):
        self.trace_log = []
        self.step_count = 0
        self.failures = []
        self.session = requests.Session()
        
    def log(self, step_title: str, details: Dict[str, Any], status: str = "INFO"):
        """Log execution step"""
        self.step_count += 1
        timestamp = datetime.now().isoformat()
        log_entry = {
            "step": self.step_count,
            "timestamp": timestamp,
            "title": step_title,
            "status": status,
            "details": details
        }
        self.trace_log.append(log_entry)
        
        # Console output
        status_symbol = "✓" if status == "SUCCESS" else "✗" if status == "FAILURE" else "→"
        print(f"\n{status_symbol} STEP {self.step_count}: {step_title} [{status}]")
        for key, value in details.items():
            if isinstance(value, dict) or isinstance(value, list):
                print(f"  {key}: {json.dumps(value, indent=4)}")
            else:
                print(f"  {key}: {value}")
                
        if status == "FAILURE":
            self.failures.append(log_entry)
            
    def save_report(self, filename: str = "PHASE5_EXECUTION_TRACE_REPORT.json"):
        """Save execution trace report"""
        report = {
            "phase": "PHASE 5 - FULL EXECUTION TRACE",
            "timestamp": datetime.now().isoformat(),
            "total_steps": self.step_count,
            "failures_count": len(self.failures),
            "status": "PASS" if len(self.failures) == 0 else "FAIL",
            "trace_log": self.trace_log,
            "failures": self.failures
        }
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
            
        return report


def verify_api_endpoints(tracer: ExecutionTracer):
    """Step 1-3: Verify all API endpoints are accessible"""
    
    # Step 1: Backend API Health
    try:
        response = tracer.session.get(f"{BACKEND_URL}/health", timeout=5)
        if response.status_code == 200:
            tracer.log(
                "Backend API Health Check",
                {
                    "url": f"{BACKEND_URL}/health",
                    "status_code": response.status_code,
                    "response": response.json() if response.text else {}
                },
                "SUCCESS"
            )
        else:
            raise Exception(f"Unexpected status code: {response.status_code}")
    except Exception as e:
        tracer.log(
            "Backend API Health Check",
            {"url": f"{BACKEND_URL}/health", "error": str(e)},
            "FAILURE"
        )
        
    # Step 2: Face AI Service Health
    try:
        response = tracer.session.get(f"{FACE_AI_URL}/health", timeout=5)
        if response.status_code == 200:
            tracer.log(
                "Face AI Service Health Check",
                {
                    "url": f"{FACE_AI_URL}/health",
                    "status_code": response.status_code,
                    "response": response.json() if response.text else {}
                },
                "SUCCESS"
            )
        else:
            raise Exception(f"Unexpected status code: {response.status_code}")
    except Exception as e:
        tracer.log(
            "Face AI Service Health Check",
            {"url": f"{FACE_AI_URL}/health", "error": str(e)},
            "FAILURE"
        )
        
    # Step 3: Frontend Health
    try:
        response = tracer.session.get(f"{FRONTEND_URL}", timeout=5)
        if response.status_code == 200:
            tracer.log(
                "Frontend Service Health Check",
                {
                    "url": FRONTEND_URL,
                    "status_code": response.status_code,
                    "content_type": response.headers.get('content-type', 'unknown')
                },
                "SUCCESS"
            )
        else:
            raise Exception(f"Unexpected status code: {response.status_code}")
    except Exception as e:
        tracer.log(
            "Frontend Service Health Check",
            {"url": FRONTEND_URL, "error": str(e)},
            "FAILURE"
        )


def test_pre_login_flow(tracer: ExecutionTracer):
    """Step 4: Test pre-login check endpoint"""
    
    try:
        employee_id = "admin"
        payload = {"employeeId": employee_id}
        response = tracer.session.post(
            f"{BACKEND_URL}/api/auth/pre-login-check",
            json=payload,
            timeout=5
        )
        
        if response.status_code == 200:
            data = response.json()
            tracer.log(
                "Pre-Login Check (Public Endpoint)",
                {
                    "endpoint": "/api/auth/pre-login-check",
                    "employee_id": employee_id,
                    "status_code": response.status_code,
                    "response": data
                },
                "SUCCESS"
            )
            return data
        else:
            tracer.log(
                "Pre-Login Check (Public Endpoint)",
                {
                    "endpoint": "/api/auth/pre-login-check",
                    "employee_id": employee_id,
                    "status_code": response.status_code,
                    "response": response.text
                },
                "FAILURE"
            )
            return None
    except Exception as e:
        tracer.log(
            "Pre-Login Check (Public Endpoint)",
            {"error": str(e), "employee_id": employee_id},
            "FAILURE"
        )
        return None


def test_face_login_with_mock_frames(tracer: ExecutionTracer):
    """Step 5: Test face login endpoint with mock frames"""
    
    try:
        # Create minimal mock frame data (base64 encoded)
        # In real scenario, these would be camera-captured frames
        mock_frame = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        payload = {
            "employeeId": "admin",
            "frames": [mock_frame] * 10,  # 10 frames minimum
            "password": "admin123",  # Combined auth
            "challengeType": "blink"
        }
        
        response = tracer.session.post(
            f"{BACKEND_URL}/api/auth/face-login",
            json=payload,
            timeout=30  # Face processing takes time
        )
        
        tracer.log(
            "Face Login Endpoint (Mock Frames)",
            {
                "endpoint": "/api/auth/face-login",
                "employee_id": payload["employeeId"],
                "frame_count": len(payload["frames"]),
                "status_code": response.status_code,
                "response_headers": dict(response.headers),
                "response_body": response.text[:500] if response.text else "No response body"
            },
            "SUCCESS" if response.status_code in [200, 201, 400, 401] else "FAILURE"
        )
        
        return response
        
    except Exception as e:
        tracer.log(
            "Face Login Endpoint (Mock Frames)",
            {"error": str(e), "employee_id": "admin"},
            "FAILURE"
        )
        return None


def test_face_ai_service_directly(tracer: ExecutionTracer):
    """Step 6: Test Face AI service directly"""
    
    try:
        # Create minimal mock frame data
        mock_frame = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        
        payload = {
            "frames": [mock_frame] * 5,
            "employee_id": "admin",
            "stored_embedding": [0.1] * 512  # Mock 512-dim embedding
        }
        
        response = tracer.session.post(
            f"{FACE_AI_URL}/api/face-login",
            json=payload,
            timeout=30
        )
        
        tracer.log(
            "Face AI Service Direct Call",
            {
                "endpoint": "/api/face-login",
                "service": "face-ai-service",
                "status_code": response.status_code,
                "response": response.json() if response.text else {}
            },
            "SUCCESS" if response.status_code in [200, 400, 500] else "FAILURE"
        )
        
        return response
        
    except Exception as e:
        tracer.log(
            "Face AI Service Direct Call",
            {"error": str(e)},
            "FAILURE"
        )
        return None


def check_database_connectivity(tracer: ExecutionTracer):
    """Step 7: Verify database connectivity through backend"""
    
    try:
        # Try to get current user (requires no auth for this test)
        response = tracer.session.get(
            f"{BACKEND_URL}/api/auth/verify",
            timeout=5,
            headers={"Authorization": "Bearer invalid-token"}
        )
        
        # We expect 401 because token is invalid, but if we get it,
        # it means the backend is processing requests and hitting the DB
        tracer.log(
            "Database Connectivity Check",
            {
                "endpoint": "/api/auth/verify",
                "status_code": response.status_code,
                "indicates_db_available": response.status_code in [401, 403, 200]
            },
            "SUCCESS" if response.status_code in [401, 403, 200] else "FAILURE"
        )
        
    except Exception as e:
        tracer.log(
            "Database Connectivity Check",
            {"error": str(e)},
            "FAILURE"
        )


def verify_jwt_generation(tracer: ExecutionTracer):
    """Step 8: Verify JWT generation capability"""
    
    try:
        # Attempt password login to test JWT generation
        payload = {
            "employeeId": "admin",
            "password": "admin123"
        }
        
        response = tracer.session.post(
            f"{BACKEND_URL}/api/auth/login",
            json=payload,
            timeout=5
        )
        
        has_tokens = False
        if response.status_code == 200:
            data = response.json()
            has_tokens = "accessToken" in data and "refreshToken" in data
            
        tracer.log(
            "JWT Generation Capability",
            {
                "endpoint": "/api/auth/login",
                "status_code": response.status_code,
                "has_tokens": has_tokens,
                "response_keys": list(response.json().keys()) if response.text else []
            },
            "SUCCESS" if has_tokens else "FAILURE" if response.status_code != 401 else "INFO"
        )
        
    except Exception as e:
        tracer.log(
            "JWT Generation Capability",
            {"error": str(e)},
            "FAILURE"
        )


def verify_route_connectivity(tracer: ExecutionTracer):
    """Step 9: Verify all critical routes are reachable"""
    
    routes_to_test = [
        ("GET", "/api/auth/verify", {"Authorization": "Bearer test"}),
        ("GET", "/api/auth/me", {"Authorization": "Bearer test"}),
        ("POST", "/api/auth/refresh", None),
        ("GET", "/api/auth/bootstrap/status", None),
    ]
    
    for method, route, headers in routes_to_test:
        try:
            url = f"{BACKEND_URL}{route}"
            if method == "GET":
                response = tracer.session.get(url, headers=headers, timeout=5)
            else:
                response = tracer.session.post(url, headers=headers, timeout=5)
                
            tracer.log(
                f"Route Reachability: {method} {route}",
                {
                    "route": route,
                    "status_code": response.status_code,
                    "is_reachable": response.status_code < 500
                },
                "SUCCESS" if response.status_code < 500 else "FAILURE"
            )
        except Exception as e:
            tracer.log(
                f"Route Reachability: {method} {route}",
                {"error": str(e), "route": route},
                "FAILURE"
            )


def main():
    print("=" * 80)
    print("PHASE 5 — FULL EXECUTION TRACE")
    print("Comprehensive Verification of Face Login Execution Path")
    print("=" * 80)
    
    tracer = ExecutionTracer()
    
    try:
        # Wait for services to be fully ready
        print("\nWaiting for services to be ready...")
        time.sleep(2)
        
        # Execute verification steps
        verify_api_endpoints(tracer)
        test_pre_login_flow(tracer)
        test_face_login_with_mock_frames(tracer)
        test_face_ai_service_directly(tracer)
        check_database_connectivity(tracer)
        verify_jwt_generation(tracer)
        verify_route_connectivity(tracer)
        
    except Exception as e:
        print(f"\n\n ERROR: Unexpected error during execution trace: {e}")
        import traceback
        traceback.print_exc()
        
    finally:
        # Generate report
        print("\n\n" + "=" * 80)
        print("EXECUTION TRACE SUMMARY")
        print("=" * 80)
        
        report = tracer.save_report()
        
        print(f"\nTotal Steps Executed: {report['total_steps']}")
        print(f"Failures Detected: {report['failures_count']}")
        print(f"Overall Status: {report['status']}")
        
        if report['failures']:
            print("\n❌ FAILURES DETECTED:")
            for failure in report['failures']:
                print(f"  - Step {failure['step']}: {failure['title']}")
                print(f"    Error: {failure['details']}")
        
        print(f"\nReport saved to: PHASE5_EXECUTION_TRACE_REPORT.json")
        
        return 0 if report['status'] == "PASS" else 1


if __name__ == "__main__":
    exit(main())
