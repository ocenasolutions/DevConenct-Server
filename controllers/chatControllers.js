const Message = require("../models/Message")
const User = require("../models/User")
const Connection = require("../models/Connection")
const mongoose = require("mongoose")

// @desc    Send a message
// @route   POST /api/messages/send
// @access  Private
const sendMessage = async (req, res) => {
  try {
    const { receiverId, content, messageType = "text" } = req.body
    const senderId = req.user.userId

    console.log("Sending message:", { senderId, receiverId, content })

    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID and content are required",
      })
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(receiverId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid receiver ID",
      })
    }

    // Check if receiver exists
    const receiver = await User.findById(receiverId)
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      })
    }

    // Create message
    const message = new Message({
      sender: senderId,
      receiver: receiverId,
      content: content.trim(),
      messageType,
    })

    await message.save()

    // Populate message with user info
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name email avatar role")
      .populate("receiver", "name email avatar role")

    // Emit real-time message via Socket.IO
    try {
      const io = req.app.get("io")
      if (io) {
        // Send to receiver
        io.to(receiverId.toString()).emit("receive_message", populatedMessage)

        // Send notification to receiver
        io.to(receiverId.toString()).emit("message_notification", {
          senderId,
          senderName: req.user.name,
          content: content.substring(0, 50) + (content.length > 50 ? "..." : ""),
          messageId: message._id,
        })
      }
    } catch (socketError) {
      console.error("Socket error:", socketError)
    }

    res.status(201).json({
      success: true,
      message: "Message sent successfully",
      data: populatedMessage,
    })
  } catch (error) {
    console.error("Send message error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get messages between two users
// @route   GET /api/messages/:userId
// @access  Private
const getMessages = async (req, res) => {
  try {
    const { userId: otherUserId } = req.params
    const { page = 1, limit = 50 } = req.query
    const currentUserId = req.user.userId

    console.log("Getting messages between:", { currentUserId, otherUserId })

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(otherUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      })
    }

    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId },
      ],
    })
      .populate("sender", "name email avatar role")
      .populate("receiver", "name email avatar role")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    // Mark messages as read
    await Message.updateMany(
      {
        sender: otherUserId,
        receiver: currentUserId,
        read: false,
      },
      {
        read: true,
        readAt: new Date(),
      },
    )

    const total = await Message.countDocuments({
      $or: [
        { sender: currentUserId, receiver: otherUserId },
        { sender: otherUserId, receiver: currentUserId },
      ],
    })

    res.json({
      success: true,
      data: {
        messages: messages.reverse(), // Reverse to show oldest first
      },
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalMessages: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Get messages error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get user's conversations
// @route   GET /api/messages/conversations
// @access  Private
const getConversations = async (req, res) => {
  try {
    const userId = req.user.userId

    console.log("Getting conversations for user:", userId)

    // Get all messages where user is sender or receiver
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: new mongoose.Types.ObjectId(userId) }, 
            { receiver: new mongoose.Types.ObjectId(userId) }
          ],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender", new mongoose.Types.ObjectId(userId)] }, 
              "$receiver", 
              "$sender"
            ],
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ["$receiver", new mongoose.Types.ObjectId(userId)] }, 
                    { $eq: ["$read", false] }
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $unwind: "$user",
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.sender",
          foreignField: "_id",
          as: "lastMessage.sender",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "lastMessage.receiver",
          foreignField: "_id",
          as: "lastMessage.receiver",
        },
      },
      {
        $unwind: "$lastMessage.sender",
      },
      {
        $unwind: "$lastMessage.receiver",
      },
      {
        $project: {
          _id: 1,
          user: {
            _id: "$user._id",
            name: "$user.name",
            email: "$user.email",
            avatar: "$user.avatar",
            role: "$user.role",
          },
          lastMessage: {
            _id: "$lastMessage._id",
            content: "$lastMessage.content",
            messageType: "$lastMessage.messageType",
            timestamp: "$lastMessage.createdAt",
            createdAt: "$lastMessage.createdAt",
            sender: {
              _id: "$lastMessage.sender._id",
              name: "$lastMessage.sender.name",
              avatar: "$lastMessage.sender.avatar",
              role: "$lastMessage.sender.role",
            },
            receiver: {
              _id: "$lastMessage.receiver._id",
              name: "$lastMessage.receiver.name",
              avatar: "$lastMessage.receiver.avatar",
              role: "$lastMessage.receiver.role",
            },
          },
          unreadCount: 1,
        },
      },
      {
        $sort: { "lastMessage.createdAt": -1 },
      },
    ])

    console.log("Found conversations:", conversations.length)

    res.json({
      success: true,
      data: {
        conversations: conversations,
      },
    })
  } catch (error) {
    console.error("Get conversations error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Mark messages as read
// @route   PUT /api/messages/:userId/read
// @access  Private
const markMessagesAsRead = async (req, res) => {
  try {
    const { userId: senderId } = req.params
    const receiverId = req.user.userId

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(senderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid sender ID",
      })
    }

    const result = await Message.updateMany(
      {
        sender: senderId,
        receiver: receiverId,
        read: false,
      },
      {
        read: true,
        readAt: new Date(),
      },
    )

    console.log(`Marked ${result.modifiedCount} messages as read`)

    // Emit read receipt via Socket.IO
    try {
      const io = req.app.get("io")
      if (io) {
        io.to(senderId.toString()).emit("messages_read", {
          readBy: receiverId,
          readAt: new Date(),
        })
      }
    } catch (socketError) {
      console.error("Socket error:", socketError)
    }

    res.json({
      success: true,
      message: "Messages marked as read",
      data: {
        modifiedCount: result.modifiedCount,
      },
    })
  } catch (error) {
    console.error("Mark messages as read error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Delete a message
// @route   DELETE /api/messages/:messageId
// @access  Private
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.params
    const userId = req.user.userId

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid message ID",
      })
    }

    const message = await Message.findById(messageId)

    if (!message) {
      return res.status(404).json({
        success: false,
        message: "Message not found",
      })
    }

    // Check if user is the sender
    if (message.sender.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this message",
      })
    }

    await Message.findByIdAndDelete(messageId)

    // Emit message deletion via Socket.IO
    try {
      const io = req.app.get("io")
      if (io) {
        io.to(message.receiver.toString()).emit("message_deleted", {
          messageId,
          deletedBy: userId,
        })
      }
    } catch (socketError) {
      console.error("Socket error:", socketError)
    }

    res.json({
      success: true,
      message: "Message deleted successfully",
    })
  } catch (error) {
    console.error("Delete message error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Get unread message count
// @route   GET /api/messages/unread/count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.userId

    const unreadCount = await Message.countDocuments({
      receiver: userId,
      read: false,
    })

    console.log(`Unread count for user ${userId}:`, unreadCount)

    res.json({
      success: true,
      data: {
        unreadCount,
      },
    })
  } catch (error) {
    console.error("Get unread count error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    Search users for conversations
// @route   GET /api/messages/search/conversations
// @access  Private
const searchUsersForConversations = async (req, res) => {
  try {
    const { query } = req.query
    const currentUserId = req.user.userId

    if (!query || query.trim().length < 2) {
      return res.json({
        success: true,
        data: {
          users: [],
        },
      })
    }

    const users = await User.find({
      _id: { $ne: currentUserId }, // Exclude current user
      $or: [
        { name: { $regex: query.trim(), $options: 'i' } },
        { email: { $regex: query.trim(), $options: 'i' } },
      ],
      isActive: true,
    })
    .select("name email avatar role")
    .limit(20)

    res.json({
      success: true,
      data: {
        users,
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

module.exports = {
  sendMessage,
  getMessages,
  getConversations,
  markMessagesAsRead,
  deleteMessage,
  getUnreadCount,
  searchUsersForConversations,
}