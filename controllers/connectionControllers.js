const Connection = require("../models/Connection")
const User = require("../models/User")
const { createNotification } = require("./notificationControllers")

// @desc    Send friend request
// @route   POST /api/connections/request
// @access  Private
const sendConnectionRequest = async (req, res) => {
  try {
    const { recipientId } = req.body
    const requesterId = req.user.userId

    if (requesterId === recipientId) {
      return res.status(400).json({
        success: false,
        message: "Cannot send connection request to yourself",
      })
    }

    // Check if recipient exists
    const recipient = await User.findById(recipientId)
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if connection already exists
    const existingConnection = await Connection.findOne({
      $or: [
        { requester: requesterId, recipient: recipientId },
        { requester: recipientId, recipient: requesterId },
      ],
    })

    if (existingConnection) {
      let message = "Connection request already exists"
      if (existingConnection.status === "accepted") {
        message = "You are already connected"
      } else if (existingConnection.status === "declined") {
        message = "Connection request was declined"
      } else if (existingConnection.status === "blocked") {
        message = "Unable to send connection request"
      }

      return res.status(400).json({
        success: false,
        message,
      })
    }

    // Create connection request
    const connection = new Connection({
      requester: requesterId,
      recipient: recipientId,
      status: "pending",
    })

    await connection.save()

    // Create notification for recipient
    await createNotification(
      recipientId,
      "connection_request",
      "New Connection Request",
      `${req.user.name} sent you a connection request`,
      { connectionId: connection._id, userId: requesterId },
    )

    res.status(201).json({
      success: true,
      message: "Connection request sent successfully",
      connection,
    })
  } catch (error) {
    console.error("Send connection request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Respond to connection request
// @route   PUT /api/connections/:id/respond
// @access  Private
const respondToConnectionRequest = async (req, res) => {
  try {
    const { action } = req.body // 'accept' or 'decline'
    const connectionId = req.params.id
    const userId = req.user.userId

    if (!["accept", "decline"].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid action. Use "accept" or "decline"',
      })
    }

    const connection = await Connection.findById(connectionId)

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Connection request not found",
      })
    }

    // Check if user is the recipient
    if (connection.recipient.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to respond to this request",
      })
    }

    if (connection.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: "Connection request has already been responded to",
      })
    }

    // Update connection status
    connection.status = action === "accept" ? "accepted" : "declined"
    if (action === "accept") {
      connection.connectionDate = new Date()
    }

    await connection.save()

    // Create notification for requester
    const notificationMessage =
      action === "accept"
        ? `${req.user.name} accepted your connection request`
        : `${req.user.name} declined your connection request`

    await createNotification(
      connection.requester,
      "connection_response",
      action === "accept" ? "Connection Accepted" : "Connection Declined",
      notificationMessage,
      { connectionId: connection._id, userId: userId },
    )

    res.json({
      success: true,
      message: `Connection request ${action}ed successfully`,
      connection,
    })
  } catch (error) {
    console.error("Respond to connection request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get user's connections
// @route   GET /api/connections
// @access  Private
const getConnections = async (req, res) => {
  try {
    const { page = 1, limit = 20, status = "accepted" } = req.query
    const userId = req.user.userId

    const connections = await Connection.find({
      $or: [
        { requester: userId, status },
        { recipient: userId, status },
      ],
    })
      .populate("requester", "name avatar role profile.location")
      .populate("recipient", "name avatar role profile.location")
      .sort({ connectionDate: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    // Format connections to show the other user
    const formattedConnections = connections.map((conn) => {
      const otherUser = conn.requester._id.toString() === userId.toString() ? conn.recipient : conn.requester

      return {
        _id: conn._id,
        user: otherUser,
        connectionDate: conn.connectionDate,
        status: conn.status,
        createdAt: conn.createdAt,
      }
    })

    const total = await Connection.countDocuments({
      $or: [
        { requester: userId, status },
        { recipient: userId, status },
      ],
    })

    res.json({
      success: true,
      connections: formattedConnections,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalConnections: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Get connections error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get pending connection requests
// @route   GET /api/connections/requests
// @access  Private
const getConnectionRequests = async (req, res) => {
  try {
    const { type = "received" } = req.query // 'received' or 'sent'
    const userId = req.user.userId

    const query = { status: "pending" }

    if (type === "received") {
      query.recipient = userId
    } else {
      query.requester = userId
    }

    const requests = await Connection.find(query)
      .populate("requester", "name avatar role profile.location profile.bio")
      .populate("recipient", "name avatar role profile.location profile.bio")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      requests,
    })
  } catch (error) {
    console.error("Get connection requests error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Remove connection
// @route   DELETE /api/connections/:id
// @access  Private
const removeConnection = async (req, res) => {
  try {
    const connectionId = req.params.id
    const userId = req.user.userId

    const connection = await Connection.findById(connectionId)

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Connection not found",
      })
    }

    // Check if user is part of this connection
    if (
      connection.requester.toString() !== userId.toString() &&
      connection.recipient.toString() !== userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to remove this connection",
      })
    }

    await Connection.findByIdAndDelete(connectionId)

    res.json({
      success: true,
      message: "Connection removed successfully",
    })
  } catch (error) {
    console.error("Remove connection error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get connection status between two users
// @route   GET /api/connections/status/:userId
// @access  Private
const getConnectionStatus = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params
    const userId = req.user.userId

    const status = await Connection.getConnectionStatus(userId, otherUserId)

    res.json({
      success: true,
      status,
    })
  } catch (error) {
    console.error("Get connection status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

module.exports = {
  sendConnectionRequest,
  respondToConnectionRequest,
  getConnections,
  getConnectionRequests,
  removeConnection,
  getConnectionStatus,
}
