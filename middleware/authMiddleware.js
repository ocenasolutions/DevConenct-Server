const jwt = require("jsonwebtoken")
const User = require("../models/User")

const authMiddleware = async (req, res, next) => {
  try {
    const token = req.header("Authorization")?.replace("Bearer ", "")

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token, authorization denied",
      })
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    console.log("Decoded token:", decoded)

    const user = await User.findById(decoded.userId).select("-password")
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Token is not valid - user not found",
      })
    }

    req.user = {
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    }

    console.log("Authenticated user:", req.user)
    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    res.status(401).json({
      success: false,
      message: "Token is not valid",
      error: error.message,
    })
  }
}

module.exports = authMiddleware
