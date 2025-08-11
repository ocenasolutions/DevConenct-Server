const express = require("express")
const router = express.Router()
const notificationController = require("../controllers/notificationControllers")
const authMiddleware = require("../middleware/authMiddleware")

// All routes are protected
router.use(authMiddleware)

// Get all notifications for user
router.get("/", notificationController.getNotifications)

// Mark specific notification as read
router.put("/:id/read", notificationController.markAsRead)

// Mark all notifications as read
router.put("/read-all", notificationController.markAllAsRead)

// Delete specific notification
router.delete("/:id", notificationController.deleteNotification)

// Get unread count
router.get("/unread-count", notificationController.getUnreadCount)

// Get notifications by type
router.get("/type/:type", notificationController.getNotificationsByType)

module.exports = router
