const express = require("express")
const router = express.Router()
const connectionController = require("../controllers/connectionControllers")
const authMiddleware = require("../middleware/authMiddleware")

router.use(authMiddleware)

router.post("/send-request", connectionController.sendConnectionRequest)
router.post("/send", connectionController.sendConnection)
router.put("/:id/respond", connectionController.respondToConnectionRequest)
router.delete("/:id", connectionController.removeConnection)

router.get("/search", connectionController.searchUsers) 
router.get("/friends", connectionController.getFriends)
router.get("/pending", connectionController.getPendingRequests) 
router.get("/sent", connectionController.getSentRequests)
router.get("/requests", connectionController.getConnectionRequests)
router.get("/suggestions", connectionController.getConnectionSuggestions)
router.get("/status/:userId", connectionController.getConnectionStatus)
router.get("/", connectionController.getConnections) 

module.exports = router