const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    receiver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: [2000, "Message content cannot exceed 2000 characters"],
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
    readAt: {
      type: Date,
    },
    messageType: {
      type: String,
      enum: ["text", "image", "file", "voice", "video"],
      default: "text",
    },
    fileUrl: {
      type: String,
    },
    fileName: {
      type: String,
    },
    fileSize: {
      type: Number,
    },
    mimeType: {
      type: String,
    },
    // For message reactions (future feature)
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        emoji: {
          type: String,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    // For message replies (future feature)
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message",
    },
    // For message editing
    edited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
    },
    // For message deletion
    deleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Compound indexes for efficient querying
messageSchema.index({ sender: 1, receiver: 1, createdAt: -1 })
messageSchema.index({ receiver: 1, read: 1 })
messageSchema.index({ createdAt: -1 })

// Virtual for checking if message is from today
messageSchema.virtual("isToday").get(function () {
  const today = new Date()
  const messageDate = new Date(this.createdAt)
  return (
    messageDate.getDate() === today.getDate() &&
    messageDate.getMonth() === today.getMonth() &&
    messageDate.getFullYear() === today.getFullYear()
  )
})

// Method to mark message as read
messageSchema.methods.markAsRead = function () {
  this.read = true
  this.readAt = new Date()
  return this.save()
}

// Static method to get conversation between two users
messageSchema.statics.getConversation = function (userId1, userId2, limit = 50) {
  return this.find({
    $or: [
      { sender: userId1, receiver: userId2 },
      { sender: userId2, receiver: userId1 },
    ],
    deleted: { $ne: true },
  })
    .populate("sender", "name email avatar role")
    .populate("receiver", "name email avatar role")
    .sort({ createdAt: -1 })
    .limit(limit)
}

// Static method to get unread count for a user
messageSchema.statics.getUnreadCount = function (userId) {
  return this.countDocuments({
    receiver: userId,
    read: false,
    deleted: { $ne: true },
  })
}

// Pre-save middleware to validate message content
messageSchema.pre("save", function (next) {
  if (this.messageType === "text" && !this.content.trim()) {
    return next(new Error("Text messages cannot be empty"))
  }
  next()
})

// Pre-find middleware to exclude deleted messages by default
messageSchema.pre(/^find/, function (next) {
  if (!this.getQuery().deleted) {
    this.where({ deleted: { $ne: true } })
  }
  next()
})

module.exports = mongoose.model("Message", messageSchema)
