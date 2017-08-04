'use strict';

const http = require('http');
const app = require('./app');
const bootstrap = require('./lib/bootstrap');
const config = require('./lib/config');
const logger = require('./lib/logger');

bootstrap.createDirectories();
bootstrap.createCredentialsFile();

const port = config.port || process.env.PORT || '8080';
app.set('port', port);
const server = http.createServer(app);
server.listen(port);

logger.info(`Blueprint is listening on port ${port}...`);

process.on('SIGTERM', () => {
  console.log('Closing on SIGTERM...');
  server.close(() => console.log('Server closed.'));
});