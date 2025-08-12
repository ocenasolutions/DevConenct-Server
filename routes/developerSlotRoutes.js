const express = require("express")
const router = express.Router()
const developerSlotController = require("../controllers/developerSlotControllers")
const authMiddleware = require("../middleware/authMiddleware")
const User = require("../models/User")

// Public routes
router.get("/public/:developerId", developerSlotController.getPublicSlots)
router.get("/developer/:developerId", developerSlotController.getPublicSlots)

// Debug route to list all developers (remove in production)
router.get("/debug/developers", async (req, res) => {
  try {
    const developers = await User.find({ role: "developer" }).select("_id name email role")
    res.json({
      success: true,
      developers,
      count: developers.length,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

// Debug route to check specific user (remove in production)
router.get("/debug/user/:userId", async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("_id name email role")
    res.json({
      success: true,
      user,
      exists: !!user,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      validObjectId: false,
    })
  }
})

router.use(authMiddleware)

router.get("/debug/current-user", (req, res) => {
  res.json({
    success: true,
    user: req.user,
    headers: req.headers.authorization,
  })
})

// Developer slot CRUD operations
router.post("/", developerSlotController.createSlot)
router.get("/", developerSlotController.getMySlots)
router.get("/stats", developerSlotController.getSlotStats)
router.put("/:id", developerSlotController.updateSlot)
router.delete("/:id", developerSlotController.deleteSlot)
router.patch("/:id/toggle", developerSlotController.toggleSlotStatus)

module.exports = router
