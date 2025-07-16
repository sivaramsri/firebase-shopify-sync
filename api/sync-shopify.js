const admin = require('firebase-admin');
const axios = require('axios');

// Initialize Firebase
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', 'https://nycsleek-otp-login-2efe5.web.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  return await fn(req, res);
};

const handler = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'Missing ID token' });
    }

    // Verify Firebase token
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    const displayName = decodedToken.name || 'NYCSleek User';

    // First check if customer exists
    let customer;
    try {
      const searchResponse = await axios.get(
        `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/customers/search.json`,
        {
          params: { query: `email:${email}` },
          headers: {
            'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
            'Content-Type': 'application/json'
          }
        }
      );

      if (searchResponse.data.customers.length > 0) {
        // Customer exists - update instead of create
        customer = searchResponse.data.customers[0];
        await axios.put(
          `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/customers/${customer.id}.json`,
          {
            customer: {
              first_name: displayName.split(' ')[0],
              last_name: displayName.split(' ')[1] || '',
              tags: 'firebase-auth,updated-from-firebase'
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );
      } else {
        // Create new customer
        const createResponse = await axios.post(
          `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/customers.json`,
          {
            customer: {
              email: email,
              first_name: displayName.split(' ')[0],
              last_name: displayName.split(' ')[1] || '',
              tags: 'firebase-auth',
              verified_email: true,
              password: generateRandomPassword(),
              password_confirmation: generateRandomPassword()
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
              'Content-Type': 'application/json'
            }
          }
        );
        customer = createResponse.data.customer;
      }

      return res.status(200).json({ 
        success: true, 
        customer: {
          id: customer.id,
          email: customer.email
        }
      });

    } catch (shopifyError) {
      console.error('🛑 Shopify API error:', {
        message: shopifyError.message,
        status: shopifyError.response?.status,
        data: shopifyError.response?.data
      });
      return res.status(500).json({ 
        success: false,
        error: shopifyError.message,
        shopify: shopifyError.response?.data
      });

    }

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ 
      success: false,
      error: error.message,
      details: error.response?.data?.errors || null
    });
  }
};

// Helper function to generate random password
function generateRandomPassword() {
  return Math.random().toString(36).slice(-8) + 'A1!'; // Adds complexity requirements
}

module.exports = allowCors(handler);