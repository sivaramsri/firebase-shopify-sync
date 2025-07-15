const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase Admin (with better error handling)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('🔥 Firebase Initialization Error:', error);
  }
}

module.exports = async function handler(req, res) {
  // Enhanced CORS configuration
  const allowedOrigins = [
    'https://nycsleek-otp-login-2efe5.web.app',
    // Add other allowed origins if needed
  ];
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Handle preflight request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // Validate content type
  if (req.headers['content-type'] !== 'application/json') {
    return res.status(415).json({ error: 'Unsupported Media Type' });
  }

  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Missing ID token' });
  }

  try {
    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    const displayName = decodedToken.name || 'Firebase User';

    // Create Shopify customer
    const shopifyResponse = await axios.post(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/customers.json`,
      {
        customer: {
          email,
          first_name: displayName.split(' ')[0],
          last_name: displayName.split(' ')[1] || '',
          tags: 'firebase-auth',
          verified_email: true // Assuming Firebase already verified the email
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 10000 // 10 seconds timeout
      }
    );

    return res.status(200).json({ 
      success: true, 
      customer: shopifyResponse.data.customer 
    });

  } catch (error) {
    console.error('🔥 Error:', error);
    
    // Handle different error types
    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({ error: 'Token expired' });
    }
    
    if (error.code === 'auth/id-token-revoked') {
      return res.status(401).json({ error: 'Token revoked' });
    }
    
    if (error.response) {
      // Shopify API error
      return res.status(error.response.status).json({
        error: 'Shopify API Error',
        details: error.response.data.errors || error.response.data
      });
    }
    
    if (error.request) {
      // No response received
      return res.status(504).json({ error: 'Shopify API timeout' });
    }
    
    // Other errors
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: error.message 
    });
  }
};