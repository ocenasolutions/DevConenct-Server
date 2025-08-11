const Connection = require("../models/Connection")
const User = require("../models/User")
const { createNotification } = require("./notificationControllers")

// @desc    Send friend request
// @route   POST /api/connections/send-request
// @access  Private
const sendConnectionRequest = async (req, res) => {
  try {
    const { userId: recipientId } = req.body
    const requesterId = req.user.userId

    console.log("Connection request:", { requesterId, recipientId })

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
    await connection.populate([
      { path: "requester", select: "name avatar role" },
      { path: "recipient", select: "name avatar role" },
    ])

    // Create notification for recipient (with error handling)
    try {
      await createNotification(
        recipientId,
        "connection_request",
        "New Connection Request",
        `${req.user.name} sent you a connection request`,
        { connectionId: connection._id, userId: requesterId },
        req,
      )
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError)
      // Don't fail the request if notification fails
    }

    // Emit real-time notification (with error handling)
    try {
      const io = req.app.get("io")
      if (io) {
        const { emitToUser } = require("../utils/socketUtils")
        emitToUser(io, recipientId, "friend_request_received", {
          connection,
          from: {
            _id: req.user.userId,
            name: req.user.name,
            avatar: req.user.avatar,
            role: req.user.role,
          },
        })
      }
    } catch (socketError) {
      console.error("Error emitting socket event:", socketError)
      // Don't fail the request if socket fails
    }

    res.status(201).json({
      success: true,
      message: "Connection request sent successfully",
      connection,
    })
  } catch (error) {
    console.error("Send connection request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Send connection request (alternative endpoint)
// @route   POST /api/connections/send
// @access  Private
const sendConnection = async (req, res) => {
  try {
    const { receiverId } = req.body
    const requesterId = req.user.userId

    console.log("Connection request:", { requesterId, receiverId })

    if (requesterId === receiverId) {
      return res.status(400).json({
        success: false,
        message: "Cannot send connection request to yourself",
      })
    }

    // Check if recipient exists
    const recipient = await User.findById(receiverId)
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if connection already exists
    const existingConnection = await Connection.findOne({
      $or: [
        { requester: requesterId, recipient: receiverId },
        { requester: receiverId, recipient: requesterId },
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
      recipient: receiverId,
      status: "pending",
    })

    await connection.save()
    await connection.populate([
      { path: "requester", select: "name avatar role" },
      { path: "recipient", select: "name avatar role" },
    ])

    // Create notification for recipient (with error handling)
    try {
      await createNotification(
        receiverId,
        "connection_request",
        "New Connection Request",
        `${req.user.name} sent you a connection request`,
        { connectionId: connection._id, userId: requesterId },
        req,
      )
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError)
      // Don't fail the request if notification fails
    }

    // Emit real-time notification (with error handling)
    try {
      const io = req.app.get("io")
      if (io) {
        const { emitToUser } = require("../utils/socketUtils")
        emitToUser(io, receiverId, "friend_request_received", {
          connection,
          from: {
            _id: req.user.userId,
            name: req.user.name,
            avatar: req.user.avatar,
            role: req.user.role,
          },
        })
      }
    } catch (socketError) {
      console.error("Error emitting socket event:", socketError)
      // Don't fail the request if socket fails
    }

    res.status(201).json({
      success: true,
      message: "Connection request sent successfully",
      connection,
    })
  } catch (error) {
    console.error("Send connection request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
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
      .populate("requester", "name avatar role")
      .populate("recipient", "name avatar role")

    if (!connection) {
      return res.status(404).json({
        success: false,
        message: "Connection request not found",
      })
    }

    // Check if user is the recipient
    if (connection.recipient._id.toString() !== userId.toString()) {
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

    // Create notification for requester (with error handling)
    try {
      const notificationMessage =
        action === "accept"
          ? `${req.user.name} accepted your connection request`
          : `${req.user.name} declined your connection request`

      await createNotification(
        connection.requester._id,
        "connection_response",
        action === "accept" ? "Connection Accepted" : "Connection Declined",
        notificationMessage,
        { connectionId: connection._id, userId: userId },
        req,
      )
    } catch (notificationError) {
      console.error("Error creating notification:", notificationError)
    }

    // Emit real-time notification (with error handling)
    try {
      const io = req.app.get("io")
      if (io) {
        const { emitToUser } = require("../utils/socketUtils")
        emitToUser(io, connection.requester._id, "friend_request_responded", {
          connection,
          action,
          respondedBy: {
            _id: req.user.userId,
            name: req.user.name,
            avatar: req.user.avatar,
            role: req.user.role,
          },
        })
      }
    } catch (socketError) {
      console.error("Error emitting socket event:", socketError)
    }

    res.json({
      success: true,
      message: `Connection request ${action}ed successfully`,
      connection,
    })
  } catch (error) {
    console.error("Respond to connection request error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
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

    console.log("Getting connections for user:", userId)

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

    console.log("Found connections:", connections.length)

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
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get user's friends (accepted connections) - FIXED
// @route   GET /api/connections/friends
// @access  Private
const getFriends = async (req, res) => {
  try {
    const userId = req.user.userId

    console.log("Getting friends for user:", userId)

    const connections = await Connection.find({
      $or: [
        { requester: userId, status: "accepted" },
        { recipient: userId, status: "accepted" },
      ],
    })
      .populate("requester", "name avatar role profile.location profile.bio profile.skills")
      .populate("recipient", "name avatar role profile.location profile.bio profile.skills")
      .sort({ connectionDate: -1 })

    console.log("Found friend connections:", connections.length)

    // Format connections to show the other user with consistent structure
    const friends = connections.map((conn) => {
      const otherUser = conn.requester._id.toString() === userId.toString() ? conn.recipient : conn.requester

      return {
        _id: otherUser._id,
        id: otherUser._id, // Add both for compatibility
        connectionId: conn._id,
        name: otherUser.name,
        avatar: otherUser.avatar,
        role: otherUser.role,
        profile: otherUser.profile,
        connectionDate: conn.connectionDate,
        createdAt: conn.createdAt,
      }
    })

    console.log("Formatted friends:", friends.length)

    res.json({
      success: true,
      friends,
      count: friends.length,
    })
  } catch (error) {
    console.error("Get friends error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get pending connection requests (received)
// @route   GET /api/connections/pending
// @access  Private
const getPendingRequests = async (req, res) => {
  try {
    const userId = req.user.userId

    const requests = await Connection.find({
      recipient: userId,
      status: "pending",
    })
      .populate("requester", "name avatar role profile.location profile.bio profile.skills")
      .populate("recipient", "name avatar role profile.location profile.bio profile.skills")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      requests,
    })
  } catch (error) {
    console.error("Get pending requests error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get sent connection requests
// @route   GET /api/connections/sent
// @access  Private
const getSentRequests = async (req, res) => {
  try {
    const userId = req.user.userId

    const requests = await Connection.find({
      requester: userId,
      status: "pending",
    })
      .populate("requester", "name avatar role profile.location profile.bio profile.skills")
      .populate("recipient", "name avatar role profile.location profile.bio profile.skills")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      requests,
    })
  } catch (error) {
    console.error("Get sent requests error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get pending connection requests (generic)
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
      .populate("requester", "name avatar role profile.location profile.bio profile.skills")
      .populate("recipient", "name avatar role profile.location profile.bio profile.skills")
      .sort({ createdAt: -1 })

    res.json({
      success: true,
      requests,
    })
  } catch (error) {
    console.error("Get connection requests error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get connection suggestions - IMPROVED
// @route   GET /api/connections/suggestions
// @access  Private
const getConnectionSuggestions = async (req, res) => {
  try {
    const userId = req.user.userId
    const { limit = 10 } = req.query

    console.log("Getting suggestions for user:", userId)

    // Get user's existing connections
    const existingConnections = await Connection.find({
      $or: [{ requester: userId }, { recipient: userId }],
    })

    const connectedUserIds = existingConnections.map((conn) =>
      conn.requester.toString() === userId.toString() ? conn.recipient.toString() : conn.requester.toString(),
    )

    // Add current user to exclude list
    connectedUserIds.push(userId.toString())

    console.log("Excluding users:", connectedUserIds)

    // Get current user's profile for matching
    const currentUser = await User.findById(userId)

    // Find potential connections based on:
    // 1. Same role (developers with developers, recruiters with recruiters)
    // 2. Similar skills (for developers)
    // 3. Same location
    // 4. Exclude already connected users
    const suggestions = await User.find({
      _id: { $nin: connectedUserIds },
      isActive: true,
    })
      .select("name avatar role profile.location profile.bio profile.skills")
      .limit(Number.parseInt(limit))
      .sort({ createdAt: -1 })

    console.log("Found suggestions:", suggestions.length)

    res.json({
      success: true,
      suggestions,
      count: suggestions.length,
    })
  } catch (error) {
    console.error("Get connection suggestions error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Search users for connections - NEW
// @route   GET /api/connections/search
// @access  Private
const searchUsers = async (req, res) => {
  try {
    const userId = req.user.userId
    const { query, limit = 20, page = 1 } = req.query

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      })
    }

    console.log("Searching users with query:", query)

    // Get user's existing connections to exclude them
    const existingConnections = await Connection.find({
      $or: [{ requester: userId }, { recipient: userId }],
    })

    const connectedUserIds = existingConnections.map((conn) =>
      conn.requester.toString() === userId.toString() ? conn.recipient.toString() : conn.requester.toString(),
    )

    // Add current user to exclude list
    connectedUserIds.push(userId.toString())

    // Build search criteria
    const searchCriteria = {
      _id: { $nin: connectedUserIds },
      isActive: true,
      $or: [
        { name: { $regex: query, $options: "i" } },
        { "profile.bio": { $regex: query, $options: "i" } },
        { "profile.skills": { $regex: query, $options: "i" } },
        { "profile.location": { $regex: query, $options: "i" } },
        { role: { $regex: query, $options: "i" } },
      ],
    }

    const users = await User.find(searchCriteria)
      .select("name avatar role profile.location profile.bio profile.skills")
      .limit(Number.parseInt(limit))
      .skip((page - 1) * limit)
      .sort({ name: 1 })

    const total = await User.countDocuments(searchCriteria)

    console.log("Found users:", users.length)

    // Get connection status for each user
    const usersWithStatus = await Promise.all(
      users.map(async (user) => {
        const connectionStatus = await Connection.getConnectionStatus(userId, user._id)
        return {
          ...user.toJSON(),
          connectionStatus,
        }
      })
    )

    res.json({
      success: true,
      users: usersWithStatus,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Search users error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
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
      message: "Server error: " + error.message,
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

    if (userId === otherUserId) {
      return res.json({
        success: true,
        status: "self",
      })
    }

    const connection = await Connection.findOne({
      $or: [
        { requester: userId, recipient: otherUserId },
        { requester: otherUserId, recipient: userId },
      ],
    })

    let status = "none"
    if (connection) {
      if (connection.status === "accepted") {
        status = "connected"
      } else if (connection.status === "pending") {
        if (connection.requester.toString() === userId.toString()) {
          status = "sent"
        } else {
          status = "received"
        }
      } else if (connection.status === "declined") {
        status = "declined"
      }
    }

    res.json({
      success: true,
      status,
      connectionId: connection?._id,
    })
  } catch (error) {
    console.error("Get connection status error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

module.exports = {
  sendConnectionRequest,
  sendConnection,
  respondToConnectionRequest,
  getConnections,
  getFriends,
  getPendingRequests,
  getSentRequests,
  getConnectionRequests,
  getConnectionSuggestions,
  searchUsers, // NEW - Add this to exports
  removeConnection,
  getConnectionStatus,
}