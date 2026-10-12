module.exports = async (req, res) => {
    try {
        if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Allow', 'GET');
            res.end('Method Not Allowed');
            return;
        }
        const cfg = {
            apiKey: process.env.VITE_FIREBASE_API_KEY || '',
            authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || '',
            databaseURL: process.env.VITE_FIREBASE_DATABASE_URL || '',
            projectId: process.env.VITE_FIREBASE_PROJECT_ID || '',
            appId: process.env.VITE_FIREBASE_APP_ID || ''
        };
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(cfg));
    } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({ error: 'server' }));
    }
};