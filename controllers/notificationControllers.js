const Notification = require("../models/Notification")
const { emitToUser } = require("../utils/socketUtils")

// Create notification
const createNotification = async (userId, type, title, message, data = {}, req = null) => {
  try {
    const notification = new Notification({
      userId,
      type,
      title,
      message,
      data,
    })

    await notification.save()
    await notification.populate([
      { path: "data.bookingId", select: "scheduledDate scheduledTime sessionType" },
      { path: "data.developerId", select: "name avatar" },
      { path: "data.recruiterId", select: "name avatar" },
      { path: "data.userId", select: "name avatar" },
      { path: "data.postId", select: "content" },
    ])

    // Emit real-time notification if request object is available
    if (req && req.app) {
      const io = req.app.get("io")
      if (io) {
        emitToUser(io, userId, "new_notification", {
          notification,
          unreadCount: await Notification.countDocuments({
            userId,
            isRead: false,
          }),
        })
      }
    }

    return notification
  } catch (error) {
    console.error("Error creating notification:", error)
    throw error
  }
}

// @desc    Get user notifications
// @route   GET /api/notifications
// @access  Private
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20, unreadOnly = false } = req.query

    const query = { userId: req.user.userId }
    if (unreadOnly === "true") {
      query.isRead = false
    }

    const notifications = await Notification.find(query)
      .populate("data.bookingId", "scheduledDate scheduledTime sessionType")
      .populate("data.developerId", "name avatar")
      .populate("data.recruiterId", "name avatar")
      .populate("data.userId", "name avatar")
      .populate("data.postId", "content")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number.parseInt(limit))

    const total = await Notification.countDocuments(query)
    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      isRead: false,
    })

    res.json({
      success: true,
      notifications,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
      unreadCount,
    })
  } catch (error) {
    console.error("Get notifications error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Mark notification as read
// @route   PUT /api/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      { isRead: true, readAt: new Date() },
      { new: true },
    )

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      })
    }

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      isRead: false,
    })

    // Emit real-time update
    const io = req.app.get("io")
    if (io) {
      emitToUser(io, req.user.userId, "notification_read", {
        notificationId: notification._id,
        unreadCount,
      })
    }

    res.json({
      success: true,
      notification,
      unreadCount,
    })
  } catch (error) {
    console.error("Mark as read error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Mark all notifications as read
// @route   PUT /api/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.userId, isRead: false }, { isRead: true, readAt: new Date() })

    // Emit real-time update
    const io = req.app.get("io")
    if (io) {
      emitToUser(io, req.user.userId, "all_notifications_read", {
        unreadCount: 0,
      })
    }

    res.json({
      success: true,
      message: "All notifications marked as read",
      unreadCount: 0,
    })
  } catch (error) {
    console.error("Mark all as read error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Delete notification
// @route   DELETE /api/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user.userId,
    })

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      })
    }

    // Get updated unread count
    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      isRead: false,
    })

    // Emit real-time update
    const io = req.app.get("io")
    if (io) {
      emitToUser(io, req.user.userId, "notification_deleted", {
        notificationId: notification._id,
        unreadCount,
      })
    }

    res.json({
      success: true,
      message: "Notification deleted",
      unreadCount,
    })
  } catch (error) {
    console.error("Delete notification error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

module.exports = {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
}
