const express = require("express")
const router = express.Router()
const chatController = require("../controllers/chatControllers")
const authMiddleware = require("../middleware/authMiddleware")

// All routes require authentication
router.use(authMiddleware)

// Message routes
router.post("/send", chatController.sendMessage)
router.get("/conversations", chatController.getConversations)
router.get("/unread/count", chatController.getUnreadCount)
router.get("/:userId", chatController.getMessages)
router.put("/:userId/read", chatController.markMessagesAsRead)
router.delete("/:messageId", chatController.deleteMessage)

module.exports = router
