const logger = require("../utils/logger.js");

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  const context = {
    userId: req.user?.id || null,
    path: req.path,
    method: req.method,
  };

  if (err.name === "CastError") {
    error.message = "Resource not found";
    error.statusCode = 404;
    logger.warn("CastError: invalid resource ID", {
      ...context,
      originalValue: err.value,
    });
  } else if (err.code === 11000) {
    error.message = "Duplicate field value entered";
    error.statusCode = 400;
    logger.warn("Duplicate key error", { ...context, keyValue: err.keyValue });
  } else if (err.name === "ValidationError") {
    error.message = Object.values(err.errors)
      .map((val) => val.message)
      .join(", ");
    error.statusCode = 400;
    logger.warn("Validation error", {
      ...context,
      validationMessage: error.message,
    });
  } else if (err.name === "JsonWebTokenError") {
    error.message = "Invalid token";
    error.statusCode = 401;
    logger.warn("JWT error", context);
  } else if (err.name === "TokenExpiredError") {
    error.message = "Token expired";
    error.statusCode = 401;
    logger.warn("JWT token expired", context);
  } else {
    logger.error(error.message || "Unhandled server error", err, context);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || "Server Error",
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
};

module.exports = { errorHandler };
