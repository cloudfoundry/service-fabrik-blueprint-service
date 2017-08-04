'use strict';

class BaseError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

class HttpError extends BaseError {
  constructor(status, reason, message) {
    super(message);
    this.status = status;
    this.reason = reason;
  }
}

class BadRequest extends HttpError {
  constructor(message) {
    super(400, 'Bad Request', message || 'The request body does not match the API specification.');
  }
}

class NotFound extends HttpError {
  constructor(message) {
    super(404, 'Not Found', message || 'The requested resource was not found.');
  }
}

class MethodNotAllowed extends HttpError {
  constructor(method, allow) {
    let message = `The method ${method} is not allowed for the resource identified by the URI`;
    super(405, 'Method Not Allowed', message);
    this.allow = allow;
  }
}

class Conflict extends HttpError {
  constructor(message) {
    super(409, 'Conflict', message);
  }
}

class Gone extends HttpError {
  constructor(message) {
    super(410, 'Gone', message);
  }
}

class InternalServerError extends HttpError {
  constructor(message) {
    super(500, 'Internal Server Error', message);
  }
}

exports.BaseError = BaseError;
exports.HttpError = HttpError;
exports.BadRequest = BadRequest;
exports.NotFound = NotFound;
exports.MethodNotAllowed = MethodNotAllowed;
exports.Conflict = Conflict;
exports.Gone = Gone;
exports.InternalServerError = InternalServerError;
