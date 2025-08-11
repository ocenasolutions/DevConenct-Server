const express = require("express")
const router = express.Router()
const authController = require("../controllers/authControllers")
const authMiddleware = require("../middleware/authMiddleware")

// Public routes
router.post("/register", authController.register)
router.post("/verify-otp", authController.verifyOTP)
router.post("/resend-otp", authController.resendOTP)
router.post("/login", authController.login)
router.post("/google", authController.googleAuth)
router.post("/google/callback", authController.googleCallback)
router.post("/github/callback", authController.githubCallback)
router.post("/linkedin", authController.linkedinAuth)
router.post("/linkedin/callback", authController.linkedinCallback)

// Protected routes
router.get("/me", authMiddleware, authController.getCurrentUser)
router.post("/logout", authMiddleware, authController.logout)
router.put("/password", authMiddleware, authController.changePassword)
router.put("/role", authMiddleware, authController.updateRole)

module.exports = router
