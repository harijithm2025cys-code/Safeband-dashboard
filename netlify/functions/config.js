const { jsonResponse } = require('./_lib');

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'GET') {
      return {
        statusCode: 405,
        headers: { Allow: 'GET' },
        body: 'Method Not Allowed'
      };
    }
    const cfg = {
      apiKey: process.env.VITE_FIREBASE_API_KEY || '',
      authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
      databaseURL: process.env.VITE_FIREBASE_DATABASE_URL || '',
      projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
      appId: process.env.VITE_FIREBASE_APP_ID || ''
    };
    return jsonResponse(200, cfg);
  } catch (e) {
    return jsonResponse(500, { error: 'server' });
  }
};