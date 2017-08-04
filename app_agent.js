'use strict';

const express = require('express');
const morganLogger = require('morgan');
const bodyParser = require('body-parser');
const logger = require('./lib/logger');
const errors = require('./lib/errors');
const NotFound = errors.NotFound;

const app = express();

app.use(morganLogger('combined', {
  stream: logger.agent.stream
}));
app.use(bodyParser.json());

// allowed routes
app.use('/v1', require('./lib/routes/agent_v1'));

// catch 404 and forward to error handler
app.use((req, res, next) => next(new NotFound()));

// use JSON for displaying errors
app.use((err, req, res, next) => {
  /* jshint unused: false */
  logger.agent.error(err);
  err.status = err.status || 500;
  res.status(err.status).json({
    description: err.message || err.reason
  });
});

module.exports = app;