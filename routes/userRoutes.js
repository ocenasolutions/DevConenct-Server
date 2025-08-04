const express = require("express")
const router = express.Router()
const userController = require("../controllers/userControllers")
const authMiddleware = require("../middleware/authMiddleware")
const { uploadAvatar, handleUploadError } = require("../middleware/uploadMiddleware")

// Public routes
router.get("/search", userController.searchUsers)
router.get("/developers", userController.getDevelopers)

// Protected routes
router.use(authMiddleware)
router.get("/profile/me", userController.getProfile)
router.get("/profile/completion", userController.getProfileCompletion)
router.put("/profile", userController.updateProfile)
router.post("/avatar", uploadAvatar.single("avatar"), handleUploadError, userController.uploadAvatar)
router.delete("/account", userController.deleteAccount)

// Public routes
router.get("/:id", userController.getUserById)

module.exports = router
