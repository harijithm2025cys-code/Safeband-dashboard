const { adapt } = require('./_adapter');
const handler = require('../../api/vitals');

exports.handler = adapt(handler);
