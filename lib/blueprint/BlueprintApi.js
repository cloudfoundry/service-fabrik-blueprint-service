'use strict';

const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const pkg = require('../../package.json');
const config = require('../config');
const errors = require('../errors');
const NotFound = errors.NotFound;
const InternalServerError = errors.InternalServerError;

const filesLocation = config.paths.files;

class BlueprintApi {

  static getInfo(req, res, next) {
    /* jshint unused:false */
    res.status(200).contentType('application/json').send({
      version: pkg.version
    });
  }

  static getMetrics(req, res, next) {
    fs.readdirAsync(filesLocation)
      .then(files => res.status(200).contentType('application/json').send({
        number_of_files: files.length
      }))
      .catch(error => next(new InternalServerError(error.message)));
  }

  static getFiles(req, res, next) {
    fs.readdirAsync(filesLocation)
      .then(files => Promise
        .map(files, (file) => fs.statAsync(`${filesLocation}/${file}`)
          .then(stat => {
            return {
              name: file,
              size: stat.size,
              file_url: `/v1/files/${file}`
            };
          })))
      .then(result_array => res.status(200).contentType('application/json').send({
        total_results: result_array.length,
        results: result_array
      }))
      .catch(error => next(new InternalServerError(error.message)));
  }

  static getFile(req, res, next) {
    const fileName = req.params.fileName;
    fs.readFileAsync(`${filesLocation}/${fileName}`, 'utf8')
      .then(data => res.status(200).contentType('text/plain').send(data))
      .catch(error => next(new NotFound(error.message)));
  }

  static createFile(req, res, next) {
    const fileName = req.params.fileName;
    const fileContent = Object.keys(req.body)[0] || '';

    fs.readFileAsync(`${filesLocation}/${fileName}`, 'utf8')
      .then(data => {
        if (data === fileContent) {
          res.status(200).send('File exists with that content.');
        } else {
          fs.writeFileAsync(`${filesLocation}/${fileName}`, fileContent, 'utf8')
            .then(() => res.status(201).send('File updated.'))
            .catch(error => next(new InternalServerError(error.message)));
        }
      })
      .catch(() => {
        fs.writeFileAsync(`${filesLocation}/${fileName}`, fileContent, 'utf8')
          .then(() => res.status(201).send('File created.'))
          .catch(error => next(new NotFound(error.message)));
      });
  }

  static deleteFile(req, res, next) {
    const fileName = req.params.fileName;

    fs.unlinkAsync(`${filesLocation}/${fileName}`)
      .then(() => res.status(200).send('File deleted.'))
      .catch({code: 'ENOENT'}, () => next(new NotFound()))
      .catch(error => next(new InternalServerError(error.message)));
  }

  static createFileWithMetadata(req, res, next) {
    /* jshint unused:false */
    const fileName = req.params.fileName;
    const fileSize = req.query.size;
    const fileContent = '0'.repeat(Math.pow(10, 6));

    if (!fileSize) {
      return next(new InternalServerError('No query parameter "size" given.'));
    }

    fs.openAsync(`${filesLocation}/${fileName}`, 'r+')
      .then(() => res.status(409).end())
      .catch(() => {
        let writableStream = fs.createWriteStream(`${filesLocation}/${fileName}`);
        for (let i = 0; i < fileSize; i++) {
          writableStream.write(fileContent);
        }
        res.status(201).send('File created.');
      });
  }
}

module.exports = BlueprintApi;
