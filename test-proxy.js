const axios = require('axios');

async function testProxy() {
  try {
    console.log('Testing proxy connection...');
    
    // Test direct backend connection
    console.log('1. Testing direct backend connection...');
    const directResponse = await axios.get('http://localhost:3001/dev-info');
    console.log('✅ Direct backend connection successful');
    
    // Test through frontend proxy
    console.log('2. Testing through frontend proxy...');
    const proxyResponse = await axios.get('http://localhost:3000/api/dev-info');
    console.log('✅ Proxy connection successful');
    console.log('Proxy response:', proxyResponse.data);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.log('Connection refused - service may not be running');
    }
  }
}

testProxy();
