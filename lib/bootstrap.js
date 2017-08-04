'use strict';

const fs = require('fs');
const yaml = require('js-yaml');
const mkdirp = require('mkdirp');

const settings_path = process.argv[2] || 'config/settings.yml';
const settings = yaml.safeLoad(fs.readFileSync(settings_path, 'utf8'));

module.exports.createDirectories = () => {
  mkdirp.sync(settings.paths.files);
  mkdirp.sync(settings.paths.credentials);
};

module.exports.createCredentialsFile = () => {
  const pathToUsers = `${settings.paths.credentials}/users.json`;

  if (!fs.existsSync(pathToUsers)) {
    fs.writeFileSync(pathToUsers, '{}', 'utf8');
  }
};
