const express = require("express")
const router = express.Router()
const authMiddleware = require("../middleware/authMiddleware")
const {
  getConversations,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  getUnreadCount,
  startConversation,
} = require("../controllers/chatControllers")

// All chat routes require authentication
router.use(authMiddleware)

// Get all conversations for the authenticated user
router.get("/conversations", getConversations)

// Get messages between authenticated user and another user
router.get("/messages/:otherUserId", getMessages)

// Send a message
router.post("/send", sendMessage)

// Mark messages as read
router.put("/messages/:otherUserId/read", markMessagesAsRead)

// Get unread message count
router.get("/unread-count", getUnreadCount)

// Start a new conversation
router.post("/start", startConversation)

module.exports = router
