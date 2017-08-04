'use strict';

process.env.NODE_ENV = 'test';
/*!
 * Common modules
 */
global.Promise = require('bluebird');
global.Recorder = require('./Recorder');
/*!
 * Attach chai to global
 */
global.chai = require('chai');
global.expect = global.chai.expect;
/*!
 * Chai Plugins
 */
global.chai.use(require('chai-spies'));
global.chai.use(require('chai-http'));