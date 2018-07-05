'use strict';

const _ = require('lodash');
const assert = require('assert');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const child_process = require('child_process');
const config = require('../config');
const logger = require('../logger');
const agent = config.agent;

const job = agent.job;
const iaasConfiguration = agent.provider;

const paths = {
  backup: process.env.AGENT_PATH_BACKUP_SCRIPT,
  restore: process.env.AGENT_PATH_RESTORE_SCRIPT,
  last_operation: process.env.SF_BACKUP_RESTORE_LAST_OPERATION_DIRECTORY,
  logs: process.env.SF_BACKUP_RESTORE_LOG_DIRECTORY
};

const credHubParams = [
  'credhub_url',
  'credhub_uaa_url',
  'credhub_key',
  'credhub_client_id',
  'credhub_client_secret',
  'credhub_username',
  'credhub_user_password'
];

const iaasSpecificParams = {
  openstack: [
    'tenant_id',
    'tenant_name',
    'auth_url',
    'user_domain_name',
    'username',
    'password'
  ],
  aws: [
    'access_key_id',
    'secret_access_key',
    'region_name'
  ],
  azure: [
    'subscription_id',
    'resource_group',
    'client_id',
    'client_secret',
    'tenant_id',
    'storageAccount',
    'storageAccessKey'
  ],
  gcp: [
    'projectId',
    'credentials'
  ]
};

function startBackup(params) {
  const agentInstanceId = _(params.vms)
    .chain()
    .filter(vm => _.eq(vm.job, job.name) && _.eq(vm.index, job.index))
    .first()
    .get('iaas_vm_metadata.vm_id')
    .value();
  const pythonParameters = _
    .chain({
      iaas: iaasConfiguration.name,
      type: params.backup.type,
      backup_guid: params.backup.guid,
      instance_id: agentInstanceId,
      secret: params.backup.secret,
      container: iaasConfiguration.container,
      job_name: 'blueprint'
    })
    .assign(iaasConfiguration.max_retries ? {
      max_retries: iaasConfiguration.max_retries
    } : {})
    .assign(_.pick(iaasConfiguration, credHubParams))
    .assign(_.pick(iaasConfiguration, iaasSpecificParams[iaasConfiguration.name]))
    //can configure the service with either IAAS credentials directly or configure it with credhub
    //incase both are configured, then credhub is used by B&R Library.
    .map((value, key) => {
      if (_.isObject(value)) {
        value = JSON.stringify(value);
      }
      return `--${key}=${value}`;
    })
    .value();

  const spawnParameters = _(paths.backup)
    .chain()
    .concat(pythonParameters)
    .flatten()
    .value();

  logger.agent.info(`python3 ${_.join(spawnParameters, ' ')}`);

  return child_process.spawn('python3', spawnParameters, {
    detached: true
  });
}

function startRestore(params) {
  const agentInstanceId = _(params.vms)
    .chain()
    .filter(vm => _.eq(vm.job, job.name) && _.eq(vm.index, job.index))
    .first()
    .get('iaas_vm_metadata.vm_id')
    .value();
  const pythonParameters = _
    .chain({
      iaas: iaasConfiguration.name,
      type: params.backup.type,
      backup_guid: params.backup.guid,
      instance_id: agentInstanceId,
      secret: params.backup.secret,
      container: iaasConfiguration.container,
      job_name: 'blueprint'
    })
    .assign(iaasConfiguration.max_retries ? {
      max_retries: iaasConfiguration.max_retries
    } : {})
    .assign(_.pick(iaasConfiguration, credHubParams))
    .assign(_.pick(iaasConfiguration, iaasSpecificParams[iaasConfiguration.name]))
    .map((value, key) => {
      if (_.isObject(value)) {
        value = JSON.stringify(value);
      }
      return `--${key}=${value}`;
    })
    .value();

  const spawnParameters = _(paths.restore)
    .chain()
    .concat(pythonParameters)
    .flatten()
    .value();

  logger.agent.info(`python3 ${_.join(spawnParameters, ' ')}`);

  return child_process.spawn('python3', spawnParameters, {
    detached: true
  });
}

function getLastOperation(operation) {
  const lastOperationStateError = {
    state: 'failed',
    stage: `[ERROR] Could not retrieve the last ${operation} operation state. `,
    updated_at: new Date().toISOString().replace(/\.(.*)Z/, 'Z')
  };
  return Promise
    .all([
      fs.readFileAsync(`${paths.last_operation}/${operation}.lastoperation.json`, 'utf8'),
      operation === 'backup' ? fs.readFileAsync(`${paths.logs}/${operation}.output.json`, 'utf8') : Promise.resolve({})
    ])
    .spread((data, jsonOutput) => _.isEmpty(data) ? lastOperationStateError : (operation === 'backup' ? _.assign(JSON.parse(data), JSON.parse(jsonOutput)) : JSON.parse(data)))
    .catch(err => {
      logger.agent.error(`Could not retrieve the last ${operation} state.`);
      logger.agent.error(err.message);
      _.set(lastOperationStateError, 'stage', lastOperationStateError.stage + err.message);
      return lastOperationStateError;
    });
}

function getLogs(operation) {
  return fs
    .readFileAsync(`${paths.logs}/${operation}.log`, 'utf8')
    .catch(err => {
      logger.agent.error(`Could not retrieve the ${operation} logs.`);
      logger.agent.error(err.message);
      return '';
    });
}


function checkForConfigParameters() {
  if (_.some([agent.job, agent.provider], _.isUndefined)) {
    throw new Error('Some required configuration parameters required for Backup & Restore are not provided (agent.job, agent.provider).');
  }
}

function checkForEnvironmentVariables() {
  assert.ok(paths.last_operation, 'Environment variable containing the path to the last operation files is not set.');
  assert.ok(paths.logs, 'Environment variable containing the path to the logs is not set.');
  assert.ok(paths.backup, 'Environment variable containing the path to the backup.py script is not set.');
  assert.ok(paths.restore, 'Environment variable containing the path to the restore.py script is not set.');

  paths.last_operation = paths.last_operation.replace(/\/$/, '');
  paths.logs = paths.logs.replace(/\/$/, '');
}

module.exports.checkForConfigParameters = checkForConfigParameters;
module.exports.checkForEnvironmentVariables = checkForEnvironmentVariables;
module.exports.startBackup = startBackup;
module.exports.startRestore = startRestore;
module.exports.getLastOperation = getLastOperation;
module.exports.getLogs = getLogs;