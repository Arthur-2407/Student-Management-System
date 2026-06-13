// Test script to verify frontend-backend connection
import api from './services/api.js';

async function testConnection() {
  try {
    console.log('Testing backend connection...');
    
    // Test health endpoint
    const healthResponse = await api.get('/health');
    console.log('✅ Health check:', healthResponse.data);
    
    // Test API endpoint
    const testResponse = await api.get('/api/test');
    console.log('✅ API test:', testResponse.data);
    
    // Test POST endpoint
    const postResponse = await api.post('/api/auth/test', { test: 'data' });
    console.log('✅ POST test:', postResponse.data);
    
    console.log('🎉 All tests passed! Frontend-backend connection is working.');
    
  } catch (error) {
    console.error('❌ Connection test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

// Run test if this file is executed directly
if (typeof window !== 'undefined') {
  // Browser environment - add to window for manual testing
  window.testConnection = testConnection;
  console.log('Test function available as window.testConnection()');
} else {
  // Node.js environment - run automatically
  testConnection();
}

export default testConnection;
