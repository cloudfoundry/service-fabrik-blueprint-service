'use strict';

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const config = require('../config');

const credentialsLocation = `${config.paths.credentials}/users.json`;

class AdminApi {

  static createUser(req, res, next) {
    const username = req.params.username;
    const password = req.body.password;

    fs.readFileAsync(credentialsLocation, 'utf8')
      .then(credentialsFile => {
        credentialsFile = JSON.parse(credentialsFile);
        credentialsFile[username] = password;
        return fs.writeFileAsync(credentialsLocation, JSON.stringify(credentialsFile));
      })
      .then(() => res.status(201).end())
      .catch(err => {
        err.status = 500;
        next(err);
      });
  }

  static deleteUser(req, res, next) {
    const username = req.params.username;

    fs.readFileAsync(credentialsLocation, 'utf8')
      .then(credentialsFile => {
        credentialsFile = JSON.parse(credentialsFile);

        if (!credentialsFile[username]) {
          res.status(404).end();
        }

        delete credentialsFile[username];
        return fs.writeFileAsync(credentialsLocation, JSON.stringify(credentialsFile));
      })
      .then(() => res.status(200).end())
      .catch((err) => {
        err.status = 500;
        next(err);
      });
  }
}

module.exports = AdminApi;