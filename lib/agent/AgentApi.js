'use strict';

const _ = require('lodash');
const request = require('request-promise');
const formatUrl = require('url').format;
const pkg = require('../../package.json');
const credentials = require('./credentials');
const backuprestore = require('./backuprestore');
const state = require('./state');
const config = require('../config');
const logger = require('../logger');
const errors = require('../errors');
const BadRequest = errors.BadRequest;
const Conflict = errors.Conflict;
const Gone = errors.Gone;
const InternalServerError = errors.InternalServerError;

const ips = config.agent.ips;
const blueprintCredentials = _.assign(config.agent.manifest.properties, {  
  ips: ips,
  hostname: ips[0]
});

class AgentApi {

  static getInfo(req, res, next) {
    /* jshint unused:false */
    pingBlueprint()
      .then(() => true)
      .catch(() => false)
      .then(operational => {
        logger.info(`Blueprint Service Operational ${operational}`);
        const baseFeatures = ['state', 'lifecycle'];
        const additionalFeatures = operational ? ['credentials', 'backup', 'restore'] : [];
        return _.concat(baseFeatures, additionalFeatures);
      })
      .then(supportedFeatures => res
        .status(200)
        .contentType('application/json')
        .send({
          name: `${pkg.name}-agent`,
          version: pkg.version,
          api_version: '1.1',
          supported_features: supportedFeatures
        })
      );
  }

  static getState(req, res, next) {
    /* jshint unused:false */
    let operational;
    let details = {};
    pingBlueprint()
      .then(() => (operational = true))
      .catch(() => (operational = false))
      .then(() => {
        if (operational) {
          return getBlueprintMetrics()
            .then(body => (details = JSON.parse(body)))
            .catch(err => logger.agent.error(err.message));
        }
      })
      .then(() => res
        .status(200)
        .send({
          operational: operational,
          details: details
        })
      );
  }

  static deprovision(req, res, next) {
    /* jshint unused:false */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/lifecycle/deprovision: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args) || !_.isEmpty(args)) {
      return next(new BadRequest());
    }

    logger.agent.warn('Dear blueprint-service, become prepared - we will get deprovisioned soon. It was a pleasure to work with you. Good bye.');
    res.status(200).contentType('application/json').send({});
  }

  static createCredentials(req, res, next) {
    /* jshint unused:false */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/credentials/create: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args.parameters)) {
      return next(new BadRequest());
    }

    credentials
      .create(blueprintCredentials, args.parameters)
      .then(credentials => res.status(200).contentType('application/json').send(credentials))
      .catch(error => next(new InternalServerError(error.message)));
  }

  static deleteCredentials(req, res, next) {
    /* jshint unused:false */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/credentials/delete: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args.credentials)) {
      return next(new BadRequest());
    }

    credentials
      .delete(blueprintCredentials, args.credentials)
      .then(() => res.status(200).contentType('application/json').send({}))
      .catch(error => next(new InternalServerError(error.message)));
  }

  static startBackup(req, res, next) {
    /* jshint unused:false,laxbreak:true */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/backup/start: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args.backup)
      || !_.isArray(args.vms)
      || !['guid', 'type', 'secret'].every(key => key in args.backup)
      || _.size(args.vms) < 1
      || _.indexOf(_.map(args.vms, vm => ['cid', 'job', 'index'].every(key => key in vm)), false) !== -1) {
      return next(new BadRequest());
    }
    if (!_.isNull(state.operation)) {
      return next(new Conflict('Another backup operation is currently in progress.'));
    }

    try {
      const operation = 'backup';
      state
        .updateLastOperation({
          state: 'new',
          stage: 'Starting python process...',
          updated_at: new Date().toISOString().replace(/\.(.*)Z/, 'Z')
        }, operation)
        .then(() => {
          const process = backuprestore.startBackup(args);
          state.registerProcessOnExit(operation, process);
          res.status(202).contentType('application/json').send({});
        });
    }
    catch (error) {
      return next(new InternalServerError(error.message));
    }
  }

  static abortBackup(req, res, next) {
    /* jshint unused:false */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/backup/abort: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args) || _.size(args) > 0) {
      return next(new BadRequest());
    }
    if (!_.eq(state.operation, 'backup')) {
      return next(new Gone('There is no backup operation currently in progress.'));
    }

    try {
      state.killCurrentProcess();
      res.status(202).contentType('application/json').send({});
    }
    catch (error) {
      return next(new InternalServerError(error.message));
    }
  }

  static getBackupLastOperation(req, res, next) {
    /* jshint unused:false */
    backuprestore.getLastOperation('backup')
      .then(last_operation => res
        .status(200)
        .contentType('application/json')
        .send(last_operation)
      )
      .catch(error => next(new InternalServerError(error.message)));
  }

  static getBackupLogs(req, res, next) {
    /* jshint:unused false */
    backuprestore.getLogs('backup')
      .then(logs => res
        .status(200)
        .contentType('application/stream+json')
        .send(logs)
      )
      .catch(error => next(new InternalServerError(error.message)));
  }

  static startRestore(req, res, next) {
    /* jshint unused:false,laxbreak:true */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/restore/start: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args.backup)
      || !_.isArray(args.vms)
      || !['guid', 'type', 'secret'].every(key => key in args.backup)
      || _.size(args.vms) < 1
      || _.indexOf(_.map(args.vms, vm => ['cid', 'job', 'index'].every(key => key in vm)), false) !== -1) {
      return next(new BadRequest());
    }
    if (!_.isNull(state.operation)) {
      return next(new Conflict('Another restore operation is currently in progress.'));
    }

    try {
      const operation = 'restore';
      state
        .updateLastOperation({
          state: 'new',
          stage: 'Starting python process...',
          updated_at: new Date().toISOString().replace(/\.(.*)Z/, 'Z')
        }, operation)
        .then(() => {
          const process = backuprestore.startRestore(args);
          state.registerProcessOnExit(operation, process);
          res.status(202).contentType('application/json').send({});
        });
    }
    catch (error) {
      return next(new InternalServerError(error.message));
    }
  }

  static abortRestore(req, res, next) {
    /* jshint:unused false */
    const args = req.body;
    logger.agent.info(`--- BlueprintAgent/restore/abort: (${JSON.stringify(args)})`);

    if (!_.isPlainObject(args) || _.size(args) > 0) {
      return next(new BadRequest());
    }
    if (!_.eq(state.operation, 'restore')) {
      return next(new Gone('There is no restore operation currently in progress.'));
    }

    try {
      state.killCurrentProcess();
      res.status(202).contentType('application/json').send({});
    }
    catch (error) {
      return next(new InternalServerError(error.message));
    }
  }

  static getRestoreLastOperation(req, res, next) {
    /* jshint:unused false */
    backuprestore.getLastOperation('restore')
      .then(last_operation => res
        .status(200)
        .contentType('application/json')
        .send(last_operation)
      )
      .catch(error => next(new InternalServerError(error.message)));
  }

  static getRestoreLogs(req, res, next) {
    /* jshint:unused false */
    backuprestore.getLogs('restore')
      .then(logs => res
        .status(200)
        .contentType('application/stream+json')
        .send(logs)
      )
      .catch(error => next(new InternalServerError(error.message)));
  }
}

module.exports = AgentApi;

function pingBlueprint() {
  return request({
    method: 'GET',
    uri: formatUrl({
      protocol: 'http',
      hostname: blueprintCredentials.hostname,
      port: blueprintCredentials.port,
      pathname: '/v1/info'
    }),
    simple: true
  });
}

function getBlueprintMetrics() {
  return request({
    method: 'GET',
    uri: formatUrl({
      protocol: 'http',
      hostname: blueprintCredentials.hostname,
      port: blueprintCredentials.port,
      pathname: '/v1/metrics'
    }),
    simple: true,
    auth: {
      user: blueprintCredentials.admin.username,
      pass: blueprintCredentials.admin.password
    }
  });
}