const rateLimit = require("express-rate-limit")

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Strict rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for connection requests
const connectionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 connection requests per windowMs
  message: {
    success: false,
    message: "Too many connection requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for messages
const messageLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // limit each IP to 30 messages per minute
  message: {
    success: false,
    message: "Too many messages sent, please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for posts
const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 posts per windowMs
  message: {
    success: false,
    message: "Too many posts created, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for file uploads
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 uploads per windowMs
  message: {
    success: false,
    message: "Too many file uploads, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

// Rate limiting for search requests
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // limit each IP to 60 searches per minute
  message: {
    success: false,
    message: "Too many search requests, please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
})

module.exports = {
  apiLimiter,
  authLimiter,
  connectionLimiter,
  messageLimiter,
  postLimiter,
  uploadLimiter,
  searchLimiter,
}
