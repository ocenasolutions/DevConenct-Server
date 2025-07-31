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

// Define your routes here
router.post("/create", createBooking)
router.get("/my-bookings", getMyBookings)
router.get("/available-slots", getAvailableSlots)
router.get("/booking/:bookingId", getBookingById)
router.put("/update-status/:bookingId", updateBookingStatus)
router.delete("/cancel/:bookingId", cancelBooking)
router.post("/review/:bookingId", addReview)
router.post("/feedback/:bookingId", addFeedback)
router.get("/available-slots-for-slot/:slotId", getAvailableSlotsForSlot)

// Add this line with the other route definitions
router.get("/test-slot/:slotId", testSlotData)

// Export the router
module.exports = router
