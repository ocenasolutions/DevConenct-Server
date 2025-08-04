const express = require("express")
const router = express.Router()
const authController = require("../controllers/authControllers")
const authMiddleware = require("../middleware/authMiddleware")

// Public routes
router.post("/register", authController.register)
router.post("/login", authController.login)
router.post("/google", authController.googleAuth)
router.post("/google/callback", authController.googleCallback)
router.post("/linkedin", authController.linkedinAuth)

// Protected routes
router.get("/me", authMiddleware, authController.getCurrentUser)
router.post("/logout", authMiddleware, authController.logout)
router.put("/password", authMiddleware, authController.changePassword)
router.put("/role", authMiddleware, authController.updateRole)

module.exports = router
