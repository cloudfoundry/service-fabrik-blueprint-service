'use strict';

const express = require('express');
const basicAuth = require('../basicAuth');
const blueprint = require('../blueprint');
const AdminApi = blueprint.AdminApi;
const BlueprintApi = blueprint.BlueprintApi;

const router = module.exports = express.Router();

router.route('/info')
  .get(BlueprintApi.getInfo);

router.use(basicAuth.blueprint);

router.route('/metrics')
  .get(BlueprintApi.getMetrics);
router.route('/files')
  .get(BlueprintApi.getFiles);
router.route('/files/:fileName')
  .get(BlueprintApi.getFile)
  .put(BlueprintApi.createFile)
  .delete(BlueprintApi.deleteFile);
router.route('/files/metadata/:fileName')
  .post(BlueprintApi.createFileWithMetadata);

router.use(basicAuth.admin);

router.route('/admin/credentials/:username')
  .put(AdminApi.createUser)
  .delete(AdminApi.deleteUser);