'use strict';

const winston = require('winston');
const config = require('./config');

winston.emitErrs = true;

function generateTransports(name) {
  const path = name === 'blueprint-agent' ? config.paths.logs_agent : config.paths.logs;
  return [
    new winston.transports.File({
      prettyPrint: true,
      level: 'debug',
      silent: false,
      colorize: true,
      timestamp: true,
      filename: `${path}/${name}.log`,
      json: false
    }),
    new winston.transports.Console({
      prettyPrint: true,
      level: 'debug',
      silent: process.env.NODE_ENV !== 'development',
      colorize: true,
      timestamp: true,
      json: false
    })
  ];
}

class Stream {
  constructor(logger) {
    this.logger = logger;
  }
  write(message, encoding) {
    /* jshint unused:false */
    this.logger.info(message);
  }
}

const logger = new winston.Logger({
  transports: generateTransports('blueprint'),
  exitOnError: true
});

const loggerAgent = new winston.Logger({
  transports: generateTransports('blueprint-agent'),
  exitOnError: true
});

logger.stream = new Stream(logger);
logger.agent = loggerAgent;
logger.agent.stream = new Stream(loggerAgent);
module.exports = logger;