const { adapt } = require('./_adapter');
const handler = require('../../api/alert');

exports.handler = adapt(handler);
