const admin = require('firebase-admin');
const axios = require('axios');

if (!admin.apps.length) {
  admin.initializeApp();
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({ error: 'Missing ID token' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    const displayName = decodedToken.name || 'Unknown';

    const response = await axios.post(
      `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/2024-04/customers.json`,
      {
        customer: {
          email: email,
          first_name: displayName.split(' ')[0],
          last_name: displayName.split(' ')[1] || '',
          tags: 'firebase-auth'
        }
      },
      {
        headers: {
          'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN,
          'Content-Type': 'application/json'
        }
      }
    );

    return res.status(200).json({ success: true, shopifyCustomer: response.data.customer });
  } catch (error) {
    console.error('Error syncing to Shopify:', error.response?.data || error.message);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
