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

async function testAPIEndpoints() {
  console.log('Testing API endpoints...\n');
  
  // Test direct backend connection
  console.log('1. Testing direct backend - /api/test endpoint...');
  makeRequest('http://localhost:3001/api/test', (error, data) => {
    if (error) {
      console.log('❌ Direct backend /api/test failed:', error.message);
    } else {
      console.log('✅ Direct backend /api/test successful');
      console.log('Response:', JSON.stringify(data, null, 2));
    }
    
    // Test through frontend proxy
    console.log('\n2. Testing through frontend proxy - /api/test endpoint...');
    makeRequest('http://localhost:3000/api/test', (error, data) => {
      if (error) {
        console.log('❌ Proxy /api/test failed:', error.message);
      } else {
        console.log('✅ Proxy /api/test successful');
        console.log('Proxy response:', JSON.stringify(data, null, 2));
      }
      
      // Test attendance endpoint
      console.log('\n3. Testing attendance endpoint through proxy...');
      makeRequest('http://localhost:3000/api/attendance/today', (error, data) => {
        if (error) {
          console.log('❌ Proxy attendance failed:', error.message);
        } else {
          console.log('✅ Proxy attendance successful');
          console.log('Attendance response:', JSON.stringify(data, null, 2));
        }
        
        console.log('\n🏁 API endpoint testing completed!');
        console.log('\n📋 Summary:');
        console.log('- Frontend: http://localhost:3000');
        console.log('- Backend: http://localhost:3001');
        console.log('- Face AI Service: http://localhost:8000');
        console.log('- Test page: http://localhost:3000/test-connection.html');
      });
    });
  });
}

testAPIEndpoints();
