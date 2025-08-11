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
    
    // Only populate paths that exist in the schema
    await notification.populate([
      { path: "data.bookingId", select: "scheduledDate scheduledTime sessionType" },
      { path: "data.developerId", select: "name avatar" },
      { path: "data.recruiterId", select: "name avatar" },
    ])

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      userId,
      isRead: false,
    })

    // Emit real-time notification if request object is available
    if (req && req.app) {
      const io = req.app.get("io")
      if (io) {
        emitToUser(io, userId, "new_notification", {
          notification,
          unreadCount,
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

// @desc    Get unread count
// @route   GET /api/notifications/unread-count
// @access  Private
const getUnreadCount = async (req, res) => {
  try {
    const unreadCount = await Notification.countDocuments({
      userId: req.user.userId,
      isRead: false,
    })

    res.json({
      success: true,
      unreadCount,
    })
  } catch (error) {
    console.error("Get unread count error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get notifications by type
// @route   GET /api/notifications/type/:type
// @access  Private
const getNotificationsByType = async (req, res) => {
  try {
    const { type } = req.params
    const { page = 1, limit = 20 } = req.query

    const notifications = await Notification.find({
      userId: req.user.userId,
      type,
    })
      .populate("data.bookingId", "scheduledDate scheduledTime sessionType")
      .populate("data.developerId", "name avatar")
      .populate("data.recruiterId", "name avatar")
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number.parseInt(limit))

    const total = await Notification.countDocuments({
      userId: req.user.userId,
      type,
    })

    res.json({
      success: true,
      notifications,
      pagination: {
        current: Number.parseInt(page),
        pages: Math.ceil(total / limit),
        total,
      },
    })
  } catch (error) {
    console.error("Get notifications by type error:", error)
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
  getUnreadCount,
  getNotificationsByType,
}