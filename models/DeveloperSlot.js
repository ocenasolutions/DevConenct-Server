const mongoose = require("mongoose")

const timeSlotSchema = new mongoose.Schema(
  {
    startTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
    endTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
    },
  },
  { _id: false },
)

const developerSlotSchema = new mongoose.Schema(
  {
    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    sessionType: {
      type: String,
      required: true,
      enum: ["consultation", "code-review", "mentoring", "interview-prep", "technical-discussion", "project-help"],
    },
    duration: {
      type: Number,
      required: true,
      min: 15,
      max: 480,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: "USD",
      enum: ["USD", "EUR", "GBP", "INR"],
    },
    availableDays: [
      {
        type: String,
        enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      },
    ],
    availableTimes: [timeSlotSchema],
    maxBookingsPerDay: {
      type: Number,
      default: 5,
      min: 1,
      max: 20,
    },
    advanceBookingDays: {
      type: Number,
      default: 30,
      min: 1,
      max: 365,
    },
    cancellationPolicy: {
      type: String,
      default: "24 hours advance notice required",
      maxlength: 500,
    },
    requirements: {
      type: String,
      maxlength: 500,
    },
    tags: [
      {
        type: String,
        trim: true,
        maxlength: 50,
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    bookingCount: {
      type: Number,
      default: 0,
    },
    averageRating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    totalReviews: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for better query performance
developerSlotSchema.index({ developerId: 1, isActive: 1 })
developerSlotSchema.index({ sessionType: 1, isActive: 1 })
developerSlotSchema.index({ price: 1, isActive: 1 })
developerSlotSchema.index({ tags: 1, isActive: 1 })
developerSlotSchema.index({ createdAt: -1 })

// Virtual for formatted price
developerSlotSchema.virtual("formattedPrice").get(function () {
  return `${this.currency} ${this.price}`
})

// Virtual for formatted duration
developerSlotSchema.virtual("formattedDuration").get(function () {
  const hours = Math.floor(this.duration / 60)
  const minutes = this.duration % 60

  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`
  } else if (hours > 0) {
    return `${hours}h`
  } else {
    return `${minutes}m`
  }
})

// Method to check if slot is available on a specific date
developerSlotSchema.methods.isAvailableOnDate = function (date) {
  const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase()
  return this.availableDays.includes(dayOfWeek)
}

// Method to get available time slots for a specific date
developerSlotSchema.methods.getAvailableTimeSlotsForDate = async function (date) {
  // Ensure date is treated as UTC to avoid timezone issues
  const targetDate = new Date(date + "T00:00:00.000Z")
  const dayOfWeek = targetDate.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }).toLowerCase()

  if (!this.availableDays.includes(dayOfWeek)) {
    return []
  }

  // Get existing bookings for this date
  const Booking = mongoose.model("Booking")
  const startOfDay = new Date(targetDate)
  const endOfDay = new Date(targetDate)
  endOfDay.setUTCHours(23, 59, 59, 999)

  const existingBookings = await Booking.find({
    slotId: this._id,
    scheduledDate: {
      $gte: startOfDay,
      $lte: endOfDay,
    },
    status: { $in: ["pending", "confirmed"] },
  }).select("scheduledTime")

  const bookedTimes = existingBookings.map((booking) => booking.scheduledTime)

  // Generate available time slots
  const availableSlots = []
  for (const timeSlot of this.availableTimes) {
    const [startHour, startMinute] = timeSlot.startTime.split(":").map(Number)
    const [endHour, endMinute] = timeSlot.endTime.split(":").map(Number)

    let currentTime = startHour * 60 + startMinute // Convert to minutes
    const endTime = endHour * 60 + endMinute

    while (currentTime + this.duration <= endTime) {
      const timeString = `${Math.floor(currentTime / 60)
        .toString()
        .padStart(2, "0")}:${(currentTime % 60).toString().padStart(2, "0")}`

      if (!bookedTimes.includes(timeString)) {
        availableSlots.push(timeString)
      }

      currentTime += this.duration
    }
  }

  return availableSlots.sort()
}

// Method to update booking statistics
developerSlotSchema.methods.updateBookingStats = async function () {
  const Booking = mongoose.model("Booking")

  // Get booking count
  const bookingCount = await Booking.countDocuments({
    slotId: this._id,
    status: { $in: ["completed", "confirmed", "pending"] },
  })

  // Get reviews
  const bookingsWithReviews = await Booking.find({
    slotId: this._id,
    status: "completed",
    "review.rating": { $exists: true },
  }).select("review.rating")

  const totalReviews = bookingsWithReviews.length
  const averageRating =
    totalReviews > 0 ? bookingsWithReviews.reduce((sum, booking) => sum + booking.review.rating, 0) / totalReviews : 0

  // Update the slot
  this.bookingCount = bookingCount
  this.totalReviews = totalReviews
  this.averageRating = Math.round(averageRating * 10) / 10 // Round to 1 decimal place

  await this.save()
}

// Pre-save validation
developerSlotSchema.pre("save", function (next) {
  // Validate time slots
  for (const timeSlot of this.availableTimes) {
    const startTime = timeSlot.startTime.split(":").map(Number)
    const endTime = timeSlot.endTime.split(":").map(Number)

    const startMinutes = startTime[0] * 60 + startTime[1]
    const endMinutes = endTime[0] * 60 + endTime[1]

    if (startMinutes >= endMinutes) {
      return next(new Error("Start time must be before end time"))
    }

    if (endMinutes - startMinutes < this.duration) {
      return next(new Error("Time slot duration must be at least as long as session duration"))
    }
  }

  next()
})

module.exports = mongoose.model("DeveloperSlot", developerSlotSchema)
