const express = require("express")
const router = express.Router()
const connectionController = require("../controllers/connectionControllers")
const authMiddleware = require("../middleware/authMiddleware")

// All routes are protected
router.use(authMiddleware)

// Connection routes
router.post("/request", connectionController.sendConnectionRequest)
router.put("/:id/respond", connectionController.respondToConnectionRequest)
router.get("/", connectionController.getConnections)
router.get("/requests", connectionController.getConnectionRequests)
router.delete("/:id", connectionController.removeConnection)
router.get("/status/:userId", connectionController.getConnectionStatus)

module.exports = router
