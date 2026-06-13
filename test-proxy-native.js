const http = require('http');

function makeRequest(url, callback) {
  const urlObj = new URL(url);
  const options = {
    hostname: urlObj.hostname,
    port: urlObj.port,
    path: urlObj.pathname + urlObj.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Node.js test client'
    }
  };

  const req = http.request(options, (res) => {
    let data = '';
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      try {
        const jsonData = JSON.parse(data);
        callback(null, jsonData);
      } catch (e) {
        callback(null, data);
      }
    });
  });

  req.on('error', (error) => {
    callback(error, null);
  });

  req.end();
}

async function testProxy() {
  console.log('Testing proxy connection...\n');
  
  // Test direct backend connection
  console.log('1. Testing direct backend connection...');
  makeRequest('http://localhost:3001/dev-info', (error, data) => {
    if (error) {
      console.log('❌ Direct backend connection failed:', error.message);
    } else {
      console.log('✅ Direct backend connection successful');
      console.log('Response:', JSON.stringify(data, null, 2));
    }
    
    // Test through frontend proxy
    console.log('\n2. Testing through frontend proxy...');
    makeRequest('http://localhost:3000/api/dev-info', (error, data) => {
      if (error) {
        console.log('❌ Proxy connection failed:', error.message);
        console.log('This suggests the Vite proxy is not working correctly');
      } else {
        console.log('✅ Proxy connection successful');
        console.log('Proxy response:', JSON.stringify(data, null, 2));
      }
      
      console.log('\n🏁 Test completed!');
    });
  });
}

testProxy();
