const mongoose = require("mongoose")

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    type: {
      type: String,
      enum: ["booking_created", "booking_confirmed", "booking_cancelled", "session_reminder", "feedback_received"],
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
data: {
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
  },
  developerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  postId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Post", 
  },
  connectionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Connection", 
  },
  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Message", 
  },
},
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes
notificationSchema.index({ userId: 1, createdAt: -1 })
notificationSchema.index({ isRead: 1 })

module.exports = mongoose.model("Notification", notificationSchema)
