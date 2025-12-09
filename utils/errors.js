/**
 * Custom error classes for better error handling and categorization
 */

/**
 * Base error class for application errors
 */
class AppError extends Error {
  constructor(message, code = "APP_ERROR", statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Network/HTTP related errors
 */
class NetworkError extends AppError {
  constructor(message, code = "NETWORK_ERROR", statusCode = 0) {
    super(message, code, statusCode);
  }
}

/**
 * Validation errors
 */
class ValidationError extends AppError {
  constructor(message, code = "VALIDATION_ERROR", statusCode = 400) {
    super(message, code, statusCode);
  }
}

/**
 * Parsing errors
 */
class ParsingError extends AppError {
  constructor(message, code = "PARSING_ERROR", statusCode = 422) {
    super(message, code, statusCode);
  }
}

/**
 * Not found errors
 */
class NotFoundError extends AppError {
  constructor(message, code = "NOT_FOUND", statusCode = 404) {
    super(message, code, statusCode);
  }
}

/**
 * Convert axios errors to application errors
 * @param {Error} err - Axios error
 * @param {string} context - Context for the error
 * @returns {AppError}
 */
function handleAxiosError(err, context = "Request") {
  if (err.response) {
    const status = err.response.status;
    if (status === 404) {
      return new NotFoundError(`${context} not found (404)`);
    }
    return new NetworkError(
      `${context} failed with HTTP ${status}: ${err.response.statusText}`,
      "HTTP_ERROR",
      status
    );
  }

  if (err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT" || err.code === "ENOTFOUND") {
    return new NetworkError(
      `${context} network error: ${err.message}`,
      err.code
    );
  }

  return new NetworkError(`${context} error: ${err.message}`);
}

module.exports = {
  AppError,
  NetworkError,
  ValidationError,
  ParsingError,
  NotFoundError,
  handleAxiosError,
};

