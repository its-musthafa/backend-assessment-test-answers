const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
};

// Fields that should never appear in logs
const SENSITIVE_FIELDS = [
  "password",
  "token",
  "authorization",
  "cookie",
  "secret",
  "creditCard",
  "ssn",
];

// Strippin sensitive fields from log context to prevent accidental leaks
const sanitize = (obj) => {
  if (!obj || typeof obj !== "object") return obj;
  const sanitized = { ...obj };
  SENSITIVE_FIELDS.forEach((field) => {
    if (sanitized[field] !== undefined) {
      sanitized[field] = "[REDACTED]";
    }
  });
  return sanitized;
};

// Core log fun
const log = (level, message, context = {}) => {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...sanitize(context),
  };

  const isDev = process.env.NODE_ENV !== "production";

  if (isDev) {
    const prefix =
      {
        error: "\x1b[31m[ERROR]\x1b[0m", // red
        warn: "\x1b[33m[WARN]\x1b[0m", // yellow
        info: "\x1b[36m[INFO]\x1b[0m", // cyan
      }[level] || "[LOG]";

    console.log(`${prefix} ${entry.timestamp} - ${message}`);
    if (Object.keys(context).length > 0) {
      console.log(JSON.stringify(sanitize(context), null, 2));
    }
  } else {
    console.log(JSON.stringify(entry));
  }
};

const logger = {
  /**
   * @param {string} message
   * @param {Error} err
   * @param {object} context - objs
   */
  error(message, err = {}, context = {}) {
    log("error", message, {
      ...context,
      errorMessage: err.message || null,
      stack: err.stack || null,
    });
  },

  // Warninhs about potential issues
  warn(message, context = {}) {
    log("warn", message, context);
  },

  // General info logs
  info(message, context = {}) {
    log("info", message, context);
  },
};

module.exports = logger;
