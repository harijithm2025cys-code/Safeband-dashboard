import http from 'http';
import { parse } from 'url';
import alertHandler from './api/alert.js';
import vitalsHandler from './api/vitals.js';
import locateHandler from './api/locate.js';
import acknowledgeHandler from './api/acknowledge.js';

const PORT = process.env.PORT || 3000;

function adaptReqRes(req, res) {
  res.status = function (code) {
    res.statusCode = code;
    return res;
  };
  res.json = function (data) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(data));
    return res;
  };
}

const server = http.createServer(async (req, res) => {
  adaptReqRes(req, res);
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = parsedUrl.pathname;

  // Read body if POST
  let bodyStr = '';
  req.on('data', chunk => { bodyStr += chunk; });
  req.on('end', async () => {
    try {
      req.body = bodyStr ? JSON.parse(bodyStr) : {};
    } catch {
      req.body = {};
    }

    try {
      if (path === '/api/alert') {
        await alertHandler(req, res);
      } else if (path === '/api/vitals') {
        await vitalsHandler(req, res);
      } else if (path === '/api/locate') {
        await locateHandler(req, res);
      } else if (path === '/api/acknowledge') {
        await acknowledgeHandler(req, res);
      } else {
        res.status(404).json({ error: 'Not found' });
      }
    } catch (err) {
      console.error('[Server Error]', err);
      res.status(500).json({ error: err.message });
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[SafeBand Local API Server] Listening on http://127.0.0.1:${PORT}`);
});

export default server;
