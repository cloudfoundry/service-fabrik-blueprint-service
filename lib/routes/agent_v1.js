'use strict';

const express = require('express');
const basicAuth = require('../basicAuth');
const AgentApi = require('../agent').AgentApi;
const errors = require('../errors');
const MethodNotAllowed = errors.MethodNotAllowed;

const router = module.exports = express.Router();

/* AGENT API VERSION: v1.1 */

router.route('/info')
  .get(AgentApi.getInfo);

router.use(basicAuth.agent);

router.route('/state')
  .get(AgentApi.getState);

router.route('/lifecycle/deprovision')
  .post(AgentApi.deprovision)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));

router.route('/preupdate')
  .post(AgentApi.preUpdate)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));

router.route('/credentials/create')
  .post(AgentApi.createCredentials)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));
router.route('/credentials/delete')
  .post(AgentApi.deleteCredentials)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));

router.route('/backup/start')
  .post(AgentApi.startBackup)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));
router.route('/backup/abort')
  .post(AgentApi.abortBackup)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));
router.route('/backup')
  .get(AgentApi.getBackupLastOperation);
router.route('/backup/logs')
  .get(AgentApi.getBackupLogs);

router.route('/restore/start')
  .post(AgentApi.startRestore)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));
router.route('/restore/abort')
  .post(AgentApi.abortRestore)
  .all((req, res, next) => next(new MethodNotAllowed(req.method, ['POST'])));
router.route('/restore')
  .get(AgentApi.getRestoreLastOperation);
router.route('/restore/logs')
  .get(AgentApi.getRestoreLogs);