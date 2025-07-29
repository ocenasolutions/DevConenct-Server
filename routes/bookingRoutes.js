const express = require("express")
const router = express.Router()
const bookingController = require("../controllers/bookingControllers")
const authMiddleware = require("../middleware/authMiddleware")

// Public routes
router.get("/available-slots/:slotId", bookingController.getAvailableSlots)

// Protected routes
router.use(authMiddleware)

// Booking CRUD operations
router.post("/", bookingController.createBooking)
router.get("/", bookingController.getMyBookings)
router.get("/:id", bookingController.getBookingById)
router.put("/:id/status", bookingController.updateBookingStatus)
router.delete("/:id", bookingController.cancelBooking)
router.post("/:id/review", bookingController.addReview)
router.post("/:id/feedback", bookingController.addFeedback) // Added feedback route

module.exports = router
