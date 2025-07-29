const jwt = require("jsonwebtoken")
const User = require("../models/User")

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId)

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid token. User not found.",
      })
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Account is deactivated.",
      })
    }

    req.user = { userId: user._id, role: user.role }

    // Add logging for debugging
    console.log("Auth middleware - User authenticated:", {
      userId: req.user.userId,
      role: req.user.role,
      path: req.path,
      method: req.method,
    })

    next()
  } catch (error) {
    console.error("Auth middleware error:", error)

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token expired. Please login again.",
      })
    }

    res.status(401).json({
      success: false,
      message: "Invalid token.",
    })
  }
}

module.exports = authMiddleware
