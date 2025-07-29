const Booking = require("../models/Booking")
const User = require("../models/User")
const DeveloperSlot = require("../models/DeveloperSlot")
const { createNotification } = require("./notificationControllers")

// @desc    Create a new booking
// @route   POST /api/bookings
// @access  Private
const createBooking = async (req, res) => {
  try {
    const { slotId, scheduledDate, scheduledTime, message, requirements } = req.body

    // Validate required fields
    if (!slotId || !scheduledDate || !scheduledTime) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields: slotId, scheduledDate, scheduledTime",
      })
    }

    // Check if slot exists and is active
    const slot = await DeveloperSlot.findById(slotId).populate("developerId", "name email")
    if (!slot || !slot.isActive) {
      return res.status(404).json({
        success: false,
        message: "Slot not found or inactive",
      })
    }

    // Check if user is trying to book their own slot
    if (slot.developerId._id.toString() === req.user.userId) {
      return res.status(400).json({
        success: false,
        message: "You cannot book your own slot",
      })
    }

    // Check if the requested date/time is available
    const requestedDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
    const now = new Date()

    if (requestedDateTime <= now) {
      return res.status(400).json({
        success: false,
        message: "Cannot book slots in the past",
      })
    }

    // Check for existing booking at the same time
    const existingBooking = await Booking.findOne({
      slotId,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      status: { $in: ["pending", "confirmed"] },
    })

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "This time slot is already booked",
      })
    }

    // Create the booking
    const booking = new Booking({
      recruiterId: req.user.userId,
      developerId: slot.developerId._id,
      slotId,
      scheduledDate: new Date(scheduledDate),
      scheduledTime,
      duration: slot.duration,
      price: slot.price,
      currency: slot.currency,
      sessionType: slot.sessionType,
      message: message || "",
      requirements: requirements || "",
      status: "pending",
    })

    await booking.save()

    // Create notification for developer
    await createNotification(
      slot.developerId._id,
      "booking_created",
      "New Booking Request",
      `${req.user.name} has requested a ${slot.sessionType} session on ${new Date(scheduledDate).toLocaleDateString()} at ${scheduledTime}`,
      {
        bookingId: booking._id,
        recruiterId: req.user.userId,
      },
    )

    // Populate the booking with developer and slot details
    const populatedBooking = await Booking.findById(booking._id)
      .populate("developerId", "name email profilePicture")
      .populate("slotId", "title description sessionType")

    res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking: populatedBooking,
    })
  } catch (error) {
    console.error("Create booking error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Get user's bookings
// @route   GET /api/bookings
// @access  Private
const getMyBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query
    const userId = req.user.userId

    // Build query based on user role
    const query = {}
    if (req.user.role === "recruiter") {
      query.recruiterId = userId
    } else if (req.user.role === "developer") {
      query.developerId = userId
    }

    // Add status filter if provided
    if (status) {
      query.status = status
    }

    const total = await Booking.countDocuments(query)
    const bookings = await Booking.find(query)
      .populate("developerId", "name email profilePicture skills")
      .populate("recruiterId", "name email profilePicture company")
      .populate("slotId", "title description sessionType")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number.parseInt(limit))

    res.json({
      success: true,
      bookings,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get bookings error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Get available slots for a developer
// @route   GET /api/bookings/available-slots/:developerId
// @access  Private
const getAvailableSlots = async (req, res) => {
  try {
    const { developerId } = req.params
    const { date } = req.query

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required",
      })
    }

    // Get all active slots for the developer
    const slots = await DeveloperSlot.find({
      developerId,
      isActive: true,
    })

    if (!slots.length) {
      return res.json({
        success: true,
        availableSlots: [],
      })
    }

    // Get existing bookings for the date
    const existingBookings = await Booking.find({
      developerId,
      date,
      status: { $in: ["pending", "confirmed"] },
    })

    // Filter available slots based on existing bookings
    const availableSlots = []

    for (const slot of slots) {
      const slotTimes = slot.availableTimes || []

      for (const timeSlot of slotTimes) {
        const isBooked = existingBookings.some((booking) => {
          return timeSlot.startTime < booking.endTime && timeSlot.endTime > booking.startTime
        })

        if (!isBooked) {
          availableSlots.push({
            slotId: slot._id,
            title: slot.title,
            description: slot.description,
            price: slot.price,
            currency: slot.currency,
            sessionType: slot.sessionType,
            duration: slot.duration,
            startTime: timeSlot.startTime,
            endTime: timeSlot.endTime,
          })
        }
      }
    }

    res.json({
      success: true,
      availableSlots,
    })
  } catch (error) {
    console.error("Get available slots error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Get booking by ID
// @route   GET /api/bookings/:id
// @access  Private
const getBookingById = async (req, res) => {
  try {
    const { id } = req.params
    const userId = req.user.userId

    const booking = await Booking.findById(id)
      .populate("developerId", "name email profilePicture skills portfolioWebsite")
      .populate("recruiterId", "name email profilePicture company")
      .populate("slotId", "title description sessionType requirements")

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      })
    }

    // Check if user has access to this booking
    if (booking.recruiterId._id.toString() !== userId && booking.developerId._id.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    res.json({
      success: true,
      booking,
    })
  } catch (error) {
    console.error("Get booking by ID error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Update booking status
// @route   PUT /api/bookings/:id/status
// @access  Private
const updateBookingStatus = async (req, res) => {
  try {
    const { id } = req.params
    const { status, reason } = req.body
    const userId = req.user.userId

    const validStatuses = ["pending", "confirmed", "cancelled", "completed", "no-show"]
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status",
      })
    }

    const booking = await Booking.findById(id)
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      })
    }

    // Check permissions
    const isDeveloper = booking.developerId.toString() === userId
    const isRecruiter = booking.recruiterId.toString() === userId

    if (!isDeveloper && !isRecruiter) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    // Business logic for status changes
    if (status === "confirmed" && !isDeveloper) {
      return res.status(403).json({
        success: false,
        message: "Only developers can confirm bookings",
      })
    }

    if (status === "cancelled") {
      const now = new Date()
      const bookingDateTime = new Date(`${booking.scheduledDate.toISOString().split("T")[0]}T${booking.scheduledTime}`)
      const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60)

      if (hoursUntilBooking < 24) {
        return res.status(400).json({
          success: false,
          message: "Cannot cancel booking less than 24 hours in advance",
        })
      }
    }

    // Update booking
    booking.status = status
    if (reason) {
      booking.cancellationReason = reason
    }
    booking.updatedAt = new Date()

    await booking.save()

    if (status === "confirmed" && isDeveloper) {
      await createNotification(
        booking.recruiterId,
        "booking_confirmed",
        "Booking Confirmed",
        `Your session with ${req.user.name} has been confirmed for ${booking.scheduledDate.toLocaleDateString()} at ${booking.scheduledTime}`,
        {
          bookingId: booking._id,
          developerId: userId,
        },
      )
    }

    const updatedBooking = await Booking.findById(id)
      .populate("developerId", "name email profilePicture")
      .populate("recruiterId", "name email profilePicture")
      .populate("slotId", "title description sessionType")

    res.json({
      success: true,
      message: `Booking ${status} successfully`,
      booking: updatedBooking,
    })
  } catch (error) {
    console.error("Update booking status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Cancel booking
// @route   DELETE /api/bookings/:id
// @access  Private
const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const userId = req.user.userId

    const booking = await Booking.findById(id)
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      })
    }

    // Check permissions
    const isDeveloper = booking.developerId.toString() === userId
    const isRecruiter = booking.recruiterId.toString() === userId

    if (!isDeveloper && !isRecruiter) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      })
    }

    // Check if booking can be cancelled
    if (booking.status === "completed" || booking.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel ${booking.status} booking`,
      })
    }

    // Check cancellation policy
    const now = new Date()
    const bookingDateTime = new Date(`${booking.scheduledDate.toISOString().split("T")[0]}T${booking.scheduledTime}`)
    const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60)

    if (hoursUntilBooking < 24) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel booking less than 24 hours in advance",
      })
    }

    // Update booking status
    booking.status = "cancelled"
    booking.cancellationReason = reason || "Cancelled by user"
    booking.updatedAt = new Date()

    await booking.save()

    res.json({
      success: true,
      message: "Booking cancelled successfully",
    })
  } catch (error) {
    console.error("Cancel booking error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Add review to booking
// @route   POST /api/bookings/:id/review
// @access  Private
const addReview = async (req, res) => {
  try {
    const { id } = req.params
    const { rating, comment } = req.body
    const userId = req.user.userId

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      })
    }

    const booking = await Booking.findById(id)
    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      })
    }

    // Check if user is the recruiter and booking is completed
    if (booking.recruiterId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the recruiter can add reviews",
      })
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only review completed bookings",
      })
    }

    if (booking.review) {
      return res.status(400).json({
        success: false,
        message: "Review already exists for this booking",
      })
    }

    // Add review
    booking.review = {
      rating,
      comment: comment || "",
      createdAt: new Date(),
    }

    await booking.save()

    res.json({
      success: true,
      message: "Review added successfully",
      review: booking.review,
    })
  } catch (error) {
    console.error("Add review error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Add feedback to booking
// @route   POST /api/bookings/:id/feedback
// @access  Private
const addFeedback = async (req, res) => {
  try {
    const { id } = req.params
    const { rating, comment, skills, communication, punctuality, expertise } = req.body
    const userId = req.user.userId

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      })
    }

    const booking = await Booking.findById(id).populate("developerId", "name email")

    if (!booking) {
      return res.status(404).json({
        success: false,
        message: "Booking not found",
      })
    }

    // Check if user is the recruiter and booking is completed
    if (booking.recruiterId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: "Only the recruiter can add feedback",
      })
    }

    if (booking.status !== "completed") {
      return res.status(400).json({
        success: false,
        message: "Can only provide feedback for completed bookings",
      })
    }

    if (booking.feedback) {
      return res.status(400).json({
        success: false,
        message: "Feedback already exists for this booking",
      })
    }

    // Add feedback
    booking.feedback = {
      rating,
      comment: comment || "",
      skills: skills || rating,
      communication: communication || rating,
      punctuality: punctuality || rating,
      expertise: expertise || rating,
      createdAt: new Date(),
    }

    await booking.save()

    // Create notification for developer
    await createNotification(
      booking.developerId._id,
      "feedback_received",
      "New Feedback Received",
      `You received a ${rating}-star rating from ${req.user.name}`,
      {
        bookingId: booking._id,
        recruiterId: userId,
      },
    )

    // Update developer's average rating
    await updateDeveloperRating(booking.developerId._id)

    res.json({
      success: true,
      message: "Feedback added successfully",
      feedback: booking.feedback,
    })
  } catch (error) {
    console.error("Add feedback error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Helper function to update developer's average rating
const updateDeveloperRating = async (developerId) => {
  try {
    const User = require("../models/User")

    const bookingsWithFeedback = await Booking.find({
      developerId,
      status: "completed",
      "feedback.rating": { $exists: true },
    }).select("feedback.rating feedback.skills feedback.communication feedback.punctuality feedback.expertise")

    if (bookingsWithFeedback.length === 0) return

    const totalRatings = bookingsWithFeedback.length
    const avgOverall = bookingsWithFeedback.reduce((sum, booking) => sum + booking.feedback.rating, 0) / totalRatings
    const avgSkills =
      bookingsWithFeedback.reduce((sum, booking) => sum + (booking.feedback.skills || booking.feedback.rating), 0) /
      totalRatings
    const avgCommunication =
      bookingsWithFeedback.reduce(
        (sum, booking) => sum + (booking.feedback.communication || booking.feedback.rating),
        0,
      ) / totalRatings
    const avgPunctuality =
      bookingsWithFeedback.reduce(
        (sum, booking) => sum + (booking.feedback.punctuality || booking.feedback.rating),
        0,
      ) / totalRatings
    const avgExpertise =
      bookingsWithFeedback.reduce((sum, booking) => sum + (booking.feedback.expertise || booking.feedback.rating), 0) /
      totalRatings

    await User.findByIdAndUpdate(developerId, {
      "profile.ratings": {
        overall: Math.round(avgOverall * 10) / 10,
        skills: Math.round(avgSkills * 10) / 10,
        communication: Math.round(avgCommunication * 10) / 10,
        punctuality: Math.round(avgPunctuality * 10) / 10,
        expertise: Math.round(avgExpertise * 10) / 10,
        totalReviews: totalRatings,
      },
    })
  } catch (error) {
    console.error("Error updating developer rating:", error)
  }
}

// @desc    Get available slots for a developer slot
// @route   GET /api/bookings/available-slots/:slotId
// @access  Public
const getAvailableSlotsForSlot = async (req, res) => {
  try {
    const { slotId } = req.params
    const { date } = req.query

    if (!date) {
      return res.status(400).json({
        success: false,
        message: "Date parameter is required",
      })
    }

    const slot = await DeveloperSlot.findById(slotId)
    if (!slot || !slot.isActive) {
      return res.status(404).json({
        success: false,
        message: "Slot not found or inactive",
      })
    }

    const requestedDate = new Date(date)
    const dayOfWeek = requestedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()

    // Check if slot is available on this day
    if (!slot.availableDays.includes(dayOfWeek)) {
      return res.json({
        success: true,
        availableSlots: [],
        message: "No availability on this day",
      })
    }

    // Get existing bookings for this date
    const existingBookings = await Booking.find({
      slotId,
      scheduledDate: requestedDate,
      status: { $in: ["pending", "confirmed"] },
    }).select("scheduledTime")

    const bookedTimes = existingBookings.map((booking) => booking.scheduledTime)

    // Generate available time slots
    const availableSlots = []
    for (const timeSlot of slot.availableTimes) {
      const [startHour, startMinute] = timeSlot.startTime.split(":").map(Number)
      const [endHour, endMinute] = timeSlot.endTime.split(":").map(Number)

      let currentTime = startHour * 60 + startMinute // Convert to minutes
      const endTime = endHour * 60 + endMinute

      while (currentTime + slot.duration <= endTime) {
        const timeString = `${Math.floor(currentTime / 60)
          .toString()
          .padStart(2, "0")}:${(currentTime % 60).toString().padStart(2, "0")}`

        if (!bookedTimes.includes(timeString)) {
          availableSlots.push(timeString)
        }

        currentTime += slot.duration
      }
    }

    res.json({
      success: true,
      availableSlots: availableSlots.sort(),
      bookedSlots: bookedTimes.sort(),
    })
  } catch (error) {
    console.error("Get available slots error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

module.exports = {
  createBooking,
  getMyBookings,
  getAvailableSlots,
  getBookingById,
  updateBookingStatus,
  cancelBooking,
  addReview,
  addFeedback,
  getAvailableSlotsForSlot,
}
