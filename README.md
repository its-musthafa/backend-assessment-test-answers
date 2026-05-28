# Backend Developer Assessment

**Candidate:** Muhammed Musthafa S
**Role:** Backend Developer

---

## Problem 1 -- API Endpoint Performance

**File:** `userController.js`

The `getDashboardStats` function was running all `countDocuments` calls sequentially. Fixed by:

- Wrapping all queries in `Promise.all` so they run in parallel, bringing response time well under 100ms for 1000+ records
- Adding a simple in-memory cache with a 5 minute TTL, keyed per user
- Clearing the cache inside `deleteUser` and exporting `invalidateStatsCache` for the auth controller to call on new user registration
- No changes needed to `modelHelper.js`, works for both MongoDB and in-memory storage

---

## Problem 2 -- Error Handling and Logging

**Files:** `logger.js` and `errorHandler.js`

The original error handler had only `console.error(err)` with no structure. Fixed by:

- Creating `logger.js`, a centralized logger with `logger.error`, `logger.warn`, and `logger.info`
- Every log entry includes timestamp, level, userId, request path, and method automatically
- Sensitive fields (password, token, authorization, cookie, secret) are replaced with `[REDACTED]`
- Development output is human-readable, production output is one JSON object per line
- Updated `errorHandler.js` to use the logger with the right level per error type
- Added JWT invalid token and JWT expired error handling

---

## Files

| File | Problem |
|------|---------|
| `userController.js` | Problem 1 -- optimized stats endpoint |
| `logger.js` | Problem 2 -- new centralized logger |
| `errorHandler.js` | Problem 2 -- updated error handler |

No new npm dependencies required.
