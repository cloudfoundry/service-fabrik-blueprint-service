'use strict';

const _ = require('lodash');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const child_process = Promise.promisifyAll(require('child_process'));
const logger = require('../logger');

class State {
  constructor() {
    this.directory = process.env.SF_BACKUP_RESTORE_LAST_OPERATION_DIRECTORY;
    this.reset();
  }

  reset() {
    this.operation = null;
    this.process = null;
  }

  getLastOperation() {
    return Promise
      .try(() => _.isNull(this.operation) ? '{}' : fs.readFileAsync(`${this.directory}/${this.operation}.lastoperation.json`, 'utf8'))
      .then(JSON.parse)
      .catchReturn({});
  }

  updateLastOperation(lastOperation, operation) {
    logger.agent.info(`Updating ${operation || this.operation} to ${JSON.stringify(lastOperation)}`);
    const target = `${this.directory}/${operation || this.operation}.lastoperation.blue.json`;
    const source = `${this.directory}/${operation || this.operation}.lastoperation.json`;
    return fs
      .writeFileAsync(target, JSON.stringify(lastOperation), 'utf8')
      .then(() => child_process.execAsync(`ln -sf ${target} ${source}`))
      .catch(err => logger.agent.error(`Error while updating last operation state: ${err.message}`));
  }

  rescueLastOperation() {
    return this
      .getLastOperation()
      .then(last_operation => {
        if (_.includes(['new', 'processing', 'aborting'], last_operation.state) || _.isEmpty(last_operation)) {
          const message = '[CRITICAL] Process disappeared unexpectedly. You should check for orphaned volumes/snapshots/other resources.';
          const lastOperation = {
            state: 'failed',
            stage: message,
            updated_at: new Date().toISOString().replace(/\.(.*)Z/, 'Z')
          };
          logger.agent.error(message);
          return this.updateLastOperation(lastOperation);
        }
      });
  }

  registerProcessOnExit(operation, process) {
    this.operation = operation;
    this.process = process;

    process.stderr.on('data', data => logger.agent.error(`Process STDERR: ${data}`));
    process.once('exit', code => {
      logger.agent.info(`Process (id: ${process.pid}) exited with code ${code}.`);
      return this
        .rescueLastOperation()
        .then(() => this.reset());
    });
  }

  killCurrentProcess() {
    if (this.process) {
      return this.process.kill('SIGINT');
    }
    throw new Error('There is no process currently running.');
  }
}

module.exports = new State();