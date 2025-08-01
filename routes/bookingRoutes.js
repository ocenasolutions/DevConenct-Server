const express = require("express")
const router = express.Router()
const {
  createBooking,
  getMyBookings,
  getAvailableSlots,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  addReview,
  addFeedback,
  getAvailableSlotsForSlot,
  testSlotData,
} = require("../controllers/bookingControllers")

// Import the middleware function directly (not destructured)
const authMiddleware = require("../middleware/authMiddleware")

// Use authMiddleware instead of protect
router.post("/", authMiddleware, createBooking)
router.get("/", authMiddleware, getMyBookings)
router.get("/available-slots/:developerId", authMiddleware, getAvailableSlots)
router.get("/slot-availability/:slotId", getAvailableSlotsForSlot)
router.get("/test-slot/:slotId", testSlotData)
router.get("/:id", authMiddleware, getBookingById)
router.put("/:id/status", authMiddleware, updateBookingStatus)
router.delete("/:id", authMiddleware, cancelBooking)
router.post("/:id/review", authMiddleware, addReview)
router.post("/:id/feedback", authMiddleware, addFeedback)

module.exports = router