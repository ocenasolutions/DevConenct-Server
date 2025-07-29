const DeveloperSlot = require("../models/DeveloperSlot")
const User = require("../models/User")
const Booking = require("../models/Booking")
const mongoose = require("mongoose")

// @desc    Create a new developer slot
// @route   POST /api/developer-slots
// @access  Private (Developer only)
const createSlot = async (req, res) => {
  try {
    const {
      title,
      description,
      sessionType,
      duration,
      price,
      currency,
      availableDays,
      availableTimes,
      maxBookingsPerDay,
      advanceBookingDays,
      requirements,
      tags,
    } = req.body

    // Check if user is a developer
    if (req.user.role !== "developer") {
      return res.status(403).json({
        success: false,
        message: "Only developers can create slots",
      })
    }

    // Validate required fields
    if (!title || !description || !sessionType || !duration || !price || !availableDays || !availableTimes) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      })
    }

    // Validate available times format
    for (const timeSlot of availableTimes) {
      if (!timeSlot.startTime || !timeSlot.endTime) {
        return res.status(400).json({
          success: false,
          message: "Each time slot must have startTime and endTime",
        })
      }
    }

    const slot = new DeveloperSlot({
      developerId: req.user.userId,
      title,
      description,
      sessionType,
      duration,
      price,
      currency: currency || "USD",
      availableDays,
      availableTimes,
      maxBookingsPerDay: maxBookingsPerDay || 5,
      advanceBookingDays: advanceBookingDays || 30,
      requirements: requirements || "",
      tags: tags || [],
    })

    await slot.save()

    res.status(201).json({
      success: true,
      message: "Slot created successfully",
      slot,
    })
  } catch (error) {
    console.error("Create slot error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Get developer's slots
// @route   GET /api/developer-slots
// @access  Private (Developer only)
const getMySlots = async (req, res) => {
  try {
    if (req.user.role !== "developer") {
      return res.status(403).json({
        success: false,
        message: "Only developers can access their slots",
      })
    }

    const { page = 1, limit = 10, status } = req.query

    const query = { developerId: req.user.userId }

    if (status === "active") {
      query.isActive = true
    } else if (status === "inactive") {
      query.isActive = false
    }

    const total = await DeveloperSlot.countDocuments(query)
    const slots = await DeveloperSlot.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number.parseInt(limit))

    res.json({
      success: true,
      slots,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get my slots error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Get public slots for a developer
// @route   GET /api/developer-slots/public/:developerId
// @access  Public
const getPublicSlots = async (req, res) => {
  try {
    const { developerId } = req.params
    const { sessionType, maxPrice, tags } = req.query

    console.log("Getting public slots for developer:", developerId)

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(developerId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid developer ID format",
      })
    }

    // Check if developer exists
    const developer = await User.findById(developerId).select(
      "name email skills profilePicture bio location portfolioWebsite role experience education githubProfile linkedinProfile",
    )

    console.log("Found developer:", developer)

    if (!developer) {
      console.log("Developer not found in database")
      return res.status(404).json({
        success: false,
        message: "Developer not found",
      })
    }

    if (developer.role !== "developer") {
      console.log("User found but role is not developer:", developer.role)
      return res.status(404).json({
        success: false,
        message: "User is not a developer",
      })
    }

    const query = {
      developerId,
      isActive: true,
    }

    if (sessionType) {
      query.sessionType = sessionType
    }

    if (maxPrice) {
      query.price = { $lte: Number.parseFloat(maxPrice) }
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : [tags]
      query.tags = { $in: tagArray }
    }

    console.log("Searching slots with query:", query)

    const slots = await DeveloperSlot.find(query).sort({ price: 1, createdAt: -1 })

    console.log("Found slots:", slots.length)

    res.json({
      success: true,
      developer,
      slots,
    })
  } catch (error) {
    console.error("Get public slots error:", error)

    // Check if it's a MongoDB ObjectId error
    if (error.name === "CastError") {
      return res.status(400).json({
        success: false,
        message: "Invalid developer ID format",
      })
    }

    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Update a slot
// @route   PUT /api/developer-slots/:id
// @access  Private (Developer only)
const updateSlot = async (req, res) => {
  try {
    const { id } = req.params
    const updateData = req.body

    console.log("Update slot request:", {
      slotId: id,
      userId: req.user.userId,
      userRole: req.user.role,
      updateData: Object.keys(updateData),
    })

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID format",
      })
    }

    const slot = await DeveloperSlot.findById(id)
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      })
    }

    console.log("Found slot:", {
      slotId: slot._id,
      developerId: slot.developerId,
      slotDeveloperIdString: slot.developerId.toString(),
      requestUserId: req.user.userId,
      requestUserIdString: req.user.userId.toString(),
      match: slot.developerId.toString() === req.user.userId.toString(),
    })

    // Check if user owns this slot - convert both to strings for comparison
    if (slot.developerId.toString() !== req.user.userId.toString()) {
      console.log("Access denied - user does not own this slot")
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only update your own slots.",
      })
    }

    // Validate available times if provided
    if (updateData.availableTimes) {
      for (const timeSlot of updateData.availableTimes) {
        if (!timeSlot.startTime || !timeSlot.endTime) {
          return res.status(400).json({
            success: false,
            message: "Each time slot must have startTime and endTime",
          })
        }
      }
    }

    // Update the slot
    Object.assign(slot, updateData)
    await slot.save()

    console.log("Slot updated successfully")

    res.json({
      success: true,
      message: "Slot updated successfully",
      slot,
    })
  } catch (error) {
    console.error("Update slot error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Delete a slot
// @route   DELETE /api/developer-slots/:id
// @access  Private (Developer only)
const deleteSlot = async (req, res) => {
  try {
    const { id } = req.params

    console.log("Delete slot request:", {
      slotId: id,
      userId: req.user.userId,
      userRole: req.user.role,
    })

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID format",
      })
    }

    const slot = await DeveloperSlot.findById(id)
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      })
    }

    // Check if user owns this slot - convert both to strings for comparison
    if (slot.developerId.toString() !== req.user.userId.toString()) {
      console.log("Access denied - user does not own this slot")
      return res.status(403).json({
        success: false,
        message: "Access denied. You can only delete your own slots.",
      })
    }

    // Check if there are any pending or confirmed bookings
    const activeBookings = await Booking.countDocuments({
      slotId: id,
      status: { $in: ["pending", "confirmed"] },
    })

    if (activeBookings > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete slot with active bookings",
      })
    }

    await DeveloperSlot.findByIdAndDelete(id)

    console.log("Slot deleted successfully")

    res.json({
      success: true,
      message: "Slot deleted successfully",
    })
  } catch (error) {
    console.error("Delete slot error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Toggle slot status
// @route   PATCH /api/developer-slots/:id/toggle
// @access  Private (Developer only)
const toggleSlotStatus = async (req, res) => {
  try {
    const { id } = req.params

    console.log("Toggle slot request:", {
      slotId: id,
      userId: req.user.userId,
      userRole: req.user.role,
    })

    // Validate ObjectId format
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid slot ID format",
      })
    }

    const slot = await DeveloperSlot.findById(id)
    if (!slot) {
      return res.status(404).json({
        success: false,
        message: "Slot not found",
      })
    }

    console.log("Found slot:", {
      slotId: slot._id,
      developerId: slot.developerId,
      currentStatus: slot.isActive,
      slotDeveloperIdString: slot.developerId.toString(),
      requestUserId: req.user.userId,
      requestUserIdString: req.user.userId.toString(),
      match: slot.developerId.toString() === req.user.userId.toString(),
    })

    // Check if user owns this slot - convert both to strings for comparison
    if (slot.developerId.toString() !== req.user.userId.toString()) {
      console.log("Access denied:", {
        slotDeveloperId: slot.developerId.toString(),
        requestUserId: req.user.userId.toString(),
        match: slot.developerId.toString() === req.user.userId.toString(),
      })

      return res.status(403).json({
        success: false,
        message: "Access denied. You can only toggle your own slots.",
      })
    }

    slot.isActive = !slot.isActive
    await slot.save()

    console.log("Slot toggled successfully:", {
      slotId: slot._id,
      newStatus: slot.isActive,
    })

    res.json({
      success: true,
      message: `Slot ${slot.isActive ? "activated" : "deactivated"} successfully`,
      slot,
    })
  } catch (error) {
    console.error("Toggle slot status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// @desc    Get slot statistics
// @route   GET /api/developer-slots/stats
// @access  Private (Developer only)
const getSlotStats = async (req, res) => {
  try {
    if (req.user.role !== "developer") {
      return res.status(403).json({
        success: false,
        message: "Only developers can access slot statistics",
      })
    }

    const stats = await DeveloperSlot.aggregate([
      { $match: { developerId: req.user.userId } },
      {
        $group: {
          _id: null,
          totalSlots: { $sum: 1 },
          activeSlots: { $sum: { $cond: ["$isActive", 1, 0] } },
          totalBookings: { $sum: "$bookingCount" },
          averagePrice: { $avg: "$price" },
        },
      },
    ])

    const sessionTypeStats = await DeveloperSlot.aggregate([
      { $match: { developerId: req.user.userId } },
      {
        $group: {
          _id: "$sessionType",
          count: { $sum: 1 },
          totalBookings: { $sum: "$bookingCount" },
          averagePrice: { $avg: "$price" },
        },
      },
    ])

    res.json({
      success: true,
      stats: stats[0] || {
        totalSlots: 0,
        activeSlots: 0,
        totalBookings: 0,
        averagePrice: 0,
      },
      sessionTypeStats,
    })
  } catch (error) {
    console.error("Get slot stats error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

module.exports = {
  createSlot,
  getMySlots,
  getPublicSlots,
  updateSlot,
  deleteSlot,
  toggleSlotStatus,
  getSlotStats,
}
