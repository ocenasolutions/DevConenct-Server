const mongoose = require("mongoose")

const connectionSchema = new mongoose.Schema(
  {
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "blocked"],
      default: "pending",
    },
    connectionDate: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
)

// Compound index to prevent duplicate connections
connectionSchema.index({ requester: 1, recipient: 1 }, { unique: true })

// Static method to check if users are connected
connectionSchema.statics.areConnected = async function (userId1, userId2) {
  const connection = await this.findOne({
    $or: [
      { requester: userId1, recipient: userId2, status: "accepted" },
      { requester: userId2, recipient: userId1, status: "accepted" },
    ],
  })
  return !!connection
}

// Static method to get connection status
connectionSchema.statics.getConnectionStatus = async function (userId1, userId2) {
  const connection = await this.findOne({
    $or: [
      { requester: userId1, recipient: userId2 },
      { requester: userId2, recipient: userId1 },
    ],
  })

  if (!connection) return "none"
  if (connection.status === "accepted") return "connected"
  if (connection.requester.toString() === userId1.toString()) return "sent"
  return "received"
}

module.exports = mongoose.model("Connection", connectionSchema)
