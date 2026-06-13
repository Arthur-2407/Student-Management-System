const express = require('express');
const cors = require('cors');

const app = express();

// CORS configuration
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true
}));

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    message: 'Backend API is running without database'
  });
});

// Test API endpoint
app.get('/api/test', (req, res) => {
  res.status(200).json({ 
    message: 'Backend API is working!',
    timestamp: new Date().toISOString()
  });
});

// Test auth endpoint
app.post('/api/auth/test', (req, res) => {
  res.status(200).json({ 
    message: 'Auth endpoint working',
    body: req.body
  });
});

const PORT = 3001;

app.listen(PORT, () => {
  console.log(`🚀 Test backend server running on port ${PORT}`);
  console.log(`🔒 CORS enabled for: http://localhost:3000`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
