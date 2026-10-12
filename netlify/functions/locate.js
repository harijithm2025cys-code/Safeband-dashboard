const { adapt } = require('./_adapter');
const handler = require('../../api/locate');

exports.handler = adapt(handler);
