const handlers = {
  config: require('../../api/config'),
  vitals: require('../../api/vitals'),
  alert: require('../../api/alert'),
  locate: require('../../api/locate')
};

exports.handler = async (event, context) => {
  const path = (event.path || '').replace(/\/+$/, '');
  const segment = path.split('/').pop();

  const handler = handlers[segment];
  if (!handler) {
    return {
      statusCode: 404,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify({ error: 'Endpoint not found' })
    };
  }

  let parsedBody = null;
  let bodyParseError = false;
  if (event.body) {
    try {
      parsedBody = JSON.parse(event.body);
    } catch (e) {
      bodyParseError = true;
    }
  }

  const headers = {};
  if (event.headers) {
    for (const [key, value] of Object.entries(event.headers)) {
      headers[key.toLowerCase()] = value;
    }
  }

  const req = {
    method: event.httpMethod,
    headers,
    body: bodyParseError ? null : parsedBody,
    rawBody: event.body,
    bodyParseError,
    query: event.queryStringParameters || {},
    url: event.path
  };

  let statusCode = 200;
  const resHeaders = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
  let responseBody = '';

  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    setHeader(name, value) {
      resHeaders[name] = value;
      return this;
    },
    json(data) {
      resHeaders['Content-Type'] = 'application/json; charset=utf-8';
      responseBody = JSON.stringify(data);
      return this;
    },
    send(data) {
      if (typeof data === 'object' && data !== null) {
        return this.json(data);
      }
      responseBody = String(data != null ? data : '');
      return this;
    },
    end(data) {
      if (data !== undefined) responseBody = String(data);
      return this;
    }
  };

  try {
    await handler(req, res);
    return {
      statusCode,
      headers: resHeaders,
      body: responseBody
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: resHeaders,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};
