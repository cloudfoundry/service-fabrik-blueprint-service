'use strict';

const auth = require('basic-auth');
const fs = require('fs');
const config = require('./config');

exports.blueprint = (req, res, next) => {
  const user = auth(req);
  fs.readFileAsync(`${config.paths.credentials}/users.json`, 'utf8')
    .then((credentials) => {
      const users = JSON.parse(credentials);
      if (user && ((users[user.name] && users[user.name] === user.pass) || (user.name === config.admin.username && user.pass === config.admin.password))) {
        return process.nextTick(next);
      }
      return res.set('WWW-Authenticate', 'Basic realm="Login required"').status(401).end();
    })
    .catch(next);
};

exports.admin = (req, res, next) => {
  const user = auth(req);
  if (user && (user.name === config.admin.username && user.pass === config.admin.password)) {
    return next();
  }
  return res.set('WWW-Authenticate', 'Basic realm="Login required"').status(401).end();
};

exports.agent = (req, res, next) => {
  const user = auth(req);
  if (user && (user.name === config.agent.username && user.pass === config.agent.password)) {
    return next();
  }
  return res.set('WWW-Authenticate', 'Basic realm="Login required"').status(401).end();
};
