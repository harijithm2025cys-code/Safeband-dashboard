const { adapt } = require('./_adapter');
const handler = require('../../api/config');

exports.handler = adapt(handler);
