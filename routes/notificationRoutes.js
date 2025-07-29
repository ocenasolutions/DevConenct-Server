const express = require("express")
const router = express.Router()
const notificationController = require("../controllers/notificationControllers")
const authMiddleware = require("../middleware/authMiddleware")

// All routes are protected
router.use(authMiddleware)

router.get("/", notificationController.getNotifications)
router.put("/:id/read", notificationController.markAsRead)
router.put("/read-all", notificationController.markAllAsRead)

module.exports = router
