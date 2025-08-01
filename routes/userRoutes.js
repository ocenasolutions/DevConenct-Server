const express = require("express")
const router = express.Router()
const userController = require("../controllers/userControllers")
const authMiddleware = require("../middleware/authMiddleware")
const { uploadAvatar } = require("../middleware/uploadMiddleware")

// All routes are protected
router.use(authMiddleware)

// Specific routes first (before parameterized routes)
router.get("/profile", userController.getProfile)
router.put("/profile", userController.updateProfile)
router.get("/profile/completion", userController.getProfileCompletion)

// Avatar upload
router.post("/avatar", uploadAvatar.single("avatar"), userController.uploadAvatar)

// Account management
router.delete("/account", userController.deleteAccount)

// General user search (this should come before /:id)
router.get("/search", userController.getUsers)

// Parameterized routes last
router.get("/:id", userController.getUserById)

module.exports = router
