'use strict';

const request = require('request-promise');
const crypto = require('crypto');
const formatUrl = require('url').format;
const logger = require('../logger');

function createCredentials(blueprintCredentials, parameters) {
  /* jshint unused: false */
  let username = crypto.randomBytes(16).toString('hex');
  let password = crypto.randomBytes(16).toString('hex');

  return request({
    method: 'PUT',
    uri: formatUrl({
      protocol: 'http',
      auth: `${blueprintCredentials.admin.username}:${blueprintCredentials.admin.password}`,
      hostname: blueprintCredentials.hostname,
      port: blueprintCredentials.port,
      pathname: `/v1/admin/credentials/${username}`,
    }),
    json: {
      password: password
    },
    resolveWithFullResponse: true,
    simple: false
  }).then(() => {
    return {
      hosts: blueprintCredentials.ips,
      hostname: blueprintCredentials.hostname,
      port: blueprintCredentials.port,
      uri: `http://${username}:${password}@${blueprintCredentials.hostname}:${blueprintCredentials.port}`,
      username: username,
      password: password
    };
  }).catch((reason) => {
    throw new Error(`${reason.name}: ${reason.message} (HTTP Status-Code: ${reason.statusCode})`);
  });
}

function deleteCredentials(blueprintCredentials, credentials) {
  return request({
    method: 'DELETE',
    uri: formatUrl({
      protocol: 'http',
      auth: `${blueprintCredentials.admin.username}:${blueprintCredentials.admin.password}`,
      hostname: blueprintCredentials.hostname,
      port: blueprintCredentials.port,
      pathname: `/v1/admin/credentials/${credentials.username}`,
    }),
    resolveWithFullResponse: true,
    simple: false
  }).then((res) => {
    if (res.statusCode === 404) {
      logger.agent.debug(`User '${credentials.username}' not deleted because it does not exist.`);
    }
    return null;
  }).catch((reason) => {
    throw new Error(`${reason.name}: ${reason.error.message} (HTTP Status-Code: ${reason.statusCode})`);
  });
}

module.exports.create = createCredentials;
module.exports.delete = deleteCredentials;