const express = require("express")
const router = express.Router()
const connectionController = require("../controllers/connectionControllers")
const authMiddleware = require("../middleware/authMiddleware")

// All routes require authentication
router.use(authMiddleware)

// Connection routes
router.post("/send-request", connectionController.sendConnectionRequest)
router.put("/:id/respond", connectionController.respondToConnectionRequest)
router.delete("/:id", connectionController.removeConnection)

// Get routes
router.get("/", connectionController.getConnections)
router.get("/friends", connectionController.getFriends)
router.get("/requests", connectionController.getConnectionRequests)
router.get("/suggestions", connectionController.getConnectionSuggestions)
router.get("/status/:userId", connectionController.getConnectionStatus)

module.exports = router