const Message = require("../models/Message")
const User = require("../models/User")
const mongoose = require("mongoose")

// Get all conversations for a user
const getConversations = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId)

    console.log(`Getting conversations for user: ${userId}`)

    // Aggregate conversations with last message and unread count
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [{ sender: userId }, { receiver: userId }],
        },
      },
      {
        $sort: { createdAt: -1 },
      },
      {
        $group: {
          _id: {
            $cond: [{ $eq: ["$sender", userId] }, "$receiver", "$sender"],
          },
          lastMessage: { $first: "$$ROOT" },
          unreadCount: {
            $sum: {
              $cond: [
                {
                  $and: [{ $eq: ["$receiver", userId] }, { $eq: ["$read", false] }],
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
          as: "userInfo",
        },
      },
      {
        $unwind: "$userInfo",
      },
      {
        $project: {
          _id: "$userInfo._id",
          name: "$userInfo.name",
          email: "$userInfo.email",
          avatar: "$userInfo.avatar",
          role: "$userInfo.role",
          lastMessage: {
            content: "$lastMessage.content",
            createdAt: "$lastMessage.createdAt",
            sender: "$lastMessage.sender",
            receiver: "$lastMessage.receiver",
          },
          unreadCount: 1,
        },
      },
      {
        $sort: { "lastMessage.createdAt": -1 },
      },
    ])

    console.log(`Found ${conversations.length} conversations`)

    res.json({
      success: true,
      conversations,
    })
  } catch (error) {
    console.error("Get conversations error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Get messages between two users
const getMessages = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId)
    const otherUserId = new mongoose.Types.ObjectId(req.params.otherUserId)

    console.log(`Getting messages between ${userId} and ${otherUserId}`)

    const messages = await Message.find({
      $or: [
        { sender: userId, receiver: otherUserId },
        { sender: otherUserId, receiver: userId },
      ],
    })
      .populate("sender", "name email avatar role")
      .populate("receiver", "name email avatar role")
      .sort({ createdAt: 1 })

    console.log(`Found ${messages.length} messages`)

    res.json({
      success: true,
      messages,
    })
  } catch (error) {
    console.error("Get messages error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Send a message
const sendMessage = async (req, res) => {
  try {
    const senderId = new mongoose.Types.ObjectId(req.user.userId)
    const { receiverId, content } = req.body

    console.log(`Sending message from ${senderId} to ${receiverId}: ${content}`)

    if (!receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID and content are required",
      })
    }

    const receiverObjectId = new mongoose.Types.ObjectId(receiverId)

    // Check if receiver exists
    const receiver = await User.findById(receiverObjectId)
    if (!receiver) {
      console.error(`Receiver not found: ${receiverId}`)
      return res.status(404).json({
        success: false,
        message: "Receiver not found",
      })
    }

    // Get sender info
    const sender = await User.findById(senderId)
    if (!sender) {
      console.error(`Sender not found: ${senderId}`)
      return res.status(404).json({
        success: false,
        message: "Sender not found",
      })
    }

    const message = new Message({
      sender: senderId,
      receiver: receiverObjectId,
      content: content.trim(),
    })

    await message.save()
    console.log(`Message saved with ID: ${message._id}`)

    // Populate the message with full user info
    const populatedMessage = await Message.findById(message._id)
      .populate("sender", "name email avatar role")
      .populate("receiver", "name email avatar role")

    res.status(201).json({
      success: true,
      message: populatedMessage,
    })
  } catch (error) {
    console.error("Send message error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Mark messages as read
const markMessagesAsRead = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId)
    const otherUserId = new mongoose.Types.ObjectId(req.params.otherUserId)

    console.log(`Marking messages as read from ${otherUserId} to ${userId}`)

    const result = await Message.updateMany(
      {
        sender: otherUserId,
        receiver: userId,
        read: false,
      },
      {
        read: true,
        readAt: new Date(),
      },
    )

    console.log(`Marked ${result.modifiedCount} messages as read`)

    res.json({
      success: true,
      message: "Messages marked as read",
      modifiedCount: result.modifiedCount,
    })
  } catch (error) {
    console.error("Mark messages as read error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Get unread message count
const getUnreadCount = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.userId)

    const unreadCount = await Message.countDocuments({
      receiver: userId,
      read: false,
    })

    console.log(`User ${userId} has ${unreadCount} unread messages`)

    res.json({
      success: true,
      unreadCount,
    })
  } catch (error) {
    console.error("Get unread count error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

// Start a new conversation
const startConversation = async (req, res) => {
  try {
    const senderId = new mongoose.Types.ObjectId(req.user.userId)
    const { receiverId, content } = req.body

    console.log(`Starting conversation from ${senderId} to ${receiverId}`)

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID is required",
      })
    }

    const receiverObjectId = new mongoose.Types.ObjectId(receiverId)

    // Check if receiver exists
    const receiver = await User.findById(receiverObjectId)
    if (!receiver) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if conversation already exists
    const existingMessage = await Message.findOne({
      $or: [
        { sender: senderId, receiver: receiverObjectId },
        { sender: receiverObjectId, receiver: senderId },
      ],
    })

    if (existingMessage) {
      console.log("Conversation already exists")
      return res.json({
        success: true,
        message: "Conversation already exists",
        conversationExists: true,
      })
    }

    // Create first message if content provided
    if (content && content.trim()) {
      const message = new Message({
        sender: senderId,
        receiver: receiverObjectId,
        content: content.trim(),
      })

      await message.save()

      const populatedMessage = await Message.findById(message._id)
        .populate("sender", "name email avatar role")
        .populate("receiver", "name email avatar role")

      console.log(`Conversation started with message ID: ${message._id}`)

      return res.status(201).json({
        success: true,
        message: populatedMessage,
        conversationStarted: true,
      })
    }

    res.json({
      success: true,
      message: "Conversation can be started",
      receiver: {
        _id: receiver._id,
        name: receiver.name,
        email: receiver.email,
        avatar: receiver.avatar,
        role: receiver.role,
      },
    })
  } catch (error) {
    console.error("Start conversation error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    })
  }
}

module.exports = {
  getConversations,
  getMessages,
  sendMessage,
  markMessagesAsRead,
  getUnreadCount,
  startConversation,
}
