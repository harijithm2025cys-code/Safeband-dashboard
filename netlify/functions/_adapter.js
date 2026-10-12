// Adapts Vercel/Express-style (req, res) handlers to Netlify Functions (event, context)
function adapt(handler) {
  return async (event, context) => {
    let statusCode = 200;
    const headers = {};
    let responseBody = null;

    let body = {};
    if (event.body) {
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch {
        body = {};
      }
    }

    // Normalize headers to lowercase keys
    const rawHeaders = event.headers || {};
    const normHeaders = {};
    for (const [k, v] of Object.entries(rawHeaders)) {
      normHeaders[k.toLowerCase()] = v;
    }

    const req = {
      method: event.httpMethod || 'GET',
      headers: normHeaders,
      body,
      query: event.queryStringParameters || {}
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      setHeader(name, val) {
        headers[name] = val;
        return this;
      },
      json(data) {
        headers['Content-Type'] = 'application/json';
        responseBody = JSON.stringify(data);
        return this;
      },
      send(data) {
        responseBody = typeof data === 'string' ? data : JSON.stringify(data);
        return this;
      },
      end(data) {
        if (data) responseBody = data;
        return this;
      }
    };

    try {
      await handler(req, res);
    } catch (err) {
      console.error('Netlify function error:', err);
      statusCode = 500;
      headers['Content-Type'] = 'application/json';
      responseBody = JSON.stringify({ error: 'internal server error' });
    }

    return {
      statusCode,
      headers,
      body: responseBody !== null ? responseBody : ''
    };
  };
}

module.exports = { adapt };
