'use strict';

const http = require('http');
const app_agent = require('./app_agent');
const config = require('./lib/config');
const logger = require('./lib/logger');
const backuprestore = require('./lib/agent/backuprestore');

// Backup/Restore: Check whether required configuration parameters are provided
try {
  backuprestore.checkForConfigParameters();
  backuprestore.checkForEnvironmentVariables();
  logger.agent.info('Backup and Restore initializational checks were done successfully.');
} catch (err) {
  logger.agent.error(`Error while trying to perform initializations for backup & restore: '${err}'`);
}

const port = config.agent.port || '2718';
app_agent.set('port', port);
const server = http.createServer(app_agent);
server.listen(port);

logger.agent.info(`Blueprint Agent is listening on port ${port}...`);

process.on('SIGTERM', () => {
  logger.warn('Closing on SIGTERM...');
  server.close(() => logger.info('Server closed.'));
});