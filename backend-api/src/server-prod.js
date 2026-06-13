// Backward-compatible production entrypoint.
// The hardened server lives in server.js and is used by Docker production.
module.exports = require('./server');
