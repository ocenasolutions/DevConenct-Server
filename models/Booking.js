const mongoose = require("mongoose")

const bookingSchema = new mongoose.Schema(
  {
    recruiterId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    developerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    slotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DeveloperSlot",
      required: true,
    },
    scheduledDate: {
      type: Date,
      required: true,
    },
    scheduledTime: {
      type: String,
      required: true,
      match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
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
    sessionType: {
      type: String,
      required: true,
      enum: ["consultation", "code-review", "mentoring", "interview-prep", "technical-discussion", "project-help"],
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed", "no-show"],
      default: "pending",
    },
    message: {
      type: String,
      maxlength: 500,
    },
    requirements: {
      type: String,
      maxlength: 1000,
    },
    cancellationReason: {
      type: String,
      maxlength: 500,
    },
    meetingLink: {
      type: String,
    },
    notes: {
      type: String,
      maxlength: 1000,
    },
    review: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        maxlength: 500,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    feedback: {
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      comment: {
        type: String,
        maxlength: 500,
      },
      skills: {
        type: Number,
        min: 1,
        max: 5,
      },
      communication: {
        type: Number,
        min: 1,
        max: 5,
      },
      punctuality: {
        type: Number,
        min: 1,
        max: 5,
      },
      expertise: {
        type: Number,
        min: 1,
        max: 5,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
    },
    paymentId: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for better query performance
bookingSchema.index({ recruiterId: 1, createdAt: -1 })
bookingSchema.index({ developerId: 1, createdAt: -1 })
bookingSchema.index({ slotId: 1, scheduledDate: 1, scheduledTime: 1 })
bookingSchema.index({ status: 1 })

// Compound index to prevent double booking
bookingSchema.index(
  {
    slotId: 1,
    scheduledDate: 1,
    scheduledTime: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "confirmed"] },
    },
  },
)

// Virtual for formatted date
bookingSchema.virtual("formattedDate").get(function () {
  return this.scheduledDate.toLocaleDateString()
})

// Virtual for formatted time
bookingSchema.virtual("formattedTime").get(function () {
  return this.scheduledTime
})

// Virtual for booking datetime
bookingSchema.virtual("bookingDateTime").get(function () {
  return new Date(`${this.scheduledDate.toISOString().split("T")[0]}T${this.scheduledTime}`)
})

// Method to check if booking can be cancelled
bookingSchema.methods.canBeCancelled = function () {
  if (this.status === "completed" || this.status === "cancelled") {
    return false
  }

  const now = new Date()
  const bookingDateTime = this.bookingDateTime
  const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60)

  return hoursUntilBooking >= 24
}

// Method to check if booking can be reviewed
bookingSchema.methods.canBeReviewed = function () {
  return this.status === "completed" && !this.review
}

// Pre-save middleware
bookingSchema.pre("save", function (next) {
  if (this.isNew) {
    // Validate that booking is not in the past
    const bookingDateTime = new Date(`${this.scheduledDate.toISOString().split("T")[0]}T${this.scheduledTime}`)
    if (bookingDateTime <= new Date()) {
      return next(new Error("Cannot create booking in the past"))
    }
  }
  next()
})

module.exports = mongoose.model("Booking", bookingSchema)
