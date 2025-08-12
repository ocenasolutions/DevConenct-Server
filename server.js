const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")
const jwt = require("jsonwebtoken")

// Load environment variables
dotenv.config()

// Import routes
const authRoutes = require("./routes/authRoutes")
const userRoutes = require("./routes/userRoutes")
const bookingRoutes = require("./routes/bookingRoutes")
const developerSlotRoutes = require("./routes/developerSlotRoutes")
const notificationRoutes = require("./routes/notificationRoutes")
const postRoutes = require("./routes/postRoutes")
const connectionRoutes = require("./routes/connectionRoutes")
const chatRoutes = require("./routes/chatRoutes")

const User = require("./models/User")
const Message = require("./models/Message")

const { emitToUser, joinRoom, leaveRoom } = require("./utils/socketUtils")

const app = express()
const server = http.createServer(app)

const corsOptions = {
  origin: process.env.CLIENT_URL || "https://dev-connect1.netlify.app",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}

app.use(cors(corsOptions))

// Socket.IO configuration
const io = socketIo(server, {
  cors: corsOptions,
  transports: ["websocket", "polling"],
})

app.set("io", io)

// Middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// Connect to MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Connected to MongoDB")
  })
  .catch((error) => {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  })

// Store online users
const onlineUsers = new Map()

// Socket.IO authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error("Authentication error: No token provided"))
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(decoded.userId).select("-password")

    if (!user) {
      return next(new Error("Authentication error: User not found"))
    }

    socket.userId = user._id.toString()
    socket.user = user
    next()
  } catch (error) {
    console.error("Socket authentication error:", error)
    next(new Error("Authentication error"))
  }
})

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log(`User ${socket.user.name} connected with socket ID: ${socket.id}`)

  // Add user to online users
  onlineUsers.set(socket.userId, {
    socketId: socket.id,
    user: socket.user,
    lastSeen: new Date(),
  })

  // Join user's personal room
  socket.join(`user_${socket.userId}`)

  // Emit online users to all clients
  io.emit("online_users", { users: Array.from(onlineUsers.keys()) })

  // Notify others that user is online
  socket.broadcast.emit("user_online", { userId: socket.userId })

  // Handle joining user room
  socket.on("join_user_room", (userId) => {
    socket.join(`user_${userId}`)
    console.log(`User ${socket.user.name} joined room: user_${userId}`)
  })

  // Handle sending messages
  socket.on("send_message", (data) => {
    const { receiverId, message } = data

    // Emit to receiver
    io.to(`user_${receiverId}`).emit("receive_message", message)

    // Emit delivery confirmation to sender
    socket.emit("message_delivered", { messageId: message._id })

    console.log(`Message sent from ${socket.userId} to ${receiverId}`)
  })

  // Handle typing indicators
  socket.on("typing", (data) => {
    const { receiverId } = data
    io.to(`user_${receiverId}`).emit("user_typing", {
      userId: socket.userId,
      userName: socket.user.name,
    })
  })

  socket.on("stop_typing", (data) => {
    const { receiverId } = data
    io.to(`user_${receiverId}`).emit("user_stopped_typing", {
      userId: socket.userId,
    })
  })

  // Handle message read receipts
  socket.on("mark_messages_read", (data) => {
    const { senderId, readBy } = data
    io.to(`user_${senderId}`).emit("messages_read", {
      readBy,
      timestamp: new Date(),
    })
  })

  // Handle booking notifications
  socket.on("booking_notification", (data) => {
    const { userId, message, type, bookingId } = data
    io.to(`user_${userId}`).emit("booking_notification", {
      message,
      type,
      bookingId,
      timestamp: new Date(),
    })
  })

  // Handle connection request notifications
  socket.on("connection_request", (data) => {
    const { receiverId, senderName, senderId } = data
    io.to(`user_${receiverId}`).emit("friend_request_notification", {
      message: `${senderName} sent you a connection request`,
      senderId,
      timestamp: new Date(),
    })
  })

  // Handle post interactions
  socket.on("post_interaction", (data) => {
    const { userId, message, type, postId } = data
    io.to(`user_${userId}`).emit("interaction_notification", {
      message,
      type,
      postId,
      timestamp: new Date(),
    })
  })

  // Handle WebRTC call events
  socket.on("call_user", (data) => {
    const { receiverId, offer, callType } = data
    console.log(`📞 Call initiated: ${socket.user.name} -> ${receiverId} (${callType})`)

    io.to(`user_${receiverId}`).emit("incoming_call", {
      callerId: socket.userId,
      callerName: socket.user.name,
      callerAvatar: socket.user.avatar,
      offer,
      callType,
    })
  })

  socket.on("answer_call", (data) => {
    const { callerId, answer } = data
    console.log(`📞 Call answered: ${socket.userId} -> ${callerId}`)

    io.to(`user_${callerId}`).emit("call_answered", {
      answer,
      answeredBy: socket.userId,
    })
  })

  socket.on("reject_call", (data) => {
    const { callerId } = data
    console.log(`📞 Call rejected: ${socket.userId} from ${callerId}`)

    io.to(`user_${callerId}`).emit("call_rejected", {
      rejectedBy: socket.userId,
    })
  })

  socket.on("end_call", (data) => {
    const { receiverId } = data
    console.log(`📞 Call ended: ${socket.userId} with ${receiverId}`)

    io.to(`user_${receiverId}`).emit("call_ended", {
      endedBy: socket.userId,
    })
  })

  // Handle ICE candidates for WebRTC
  socket.on("ice_candidate", (data) => {
    const { receiverId, candidate } = data
    console.log(`🧊 ICE candidate: ${socket.userId} -> ${receiverId}`)

    io.to(`user_${receiverId}`).emit("ice_candidate", {
      candidate,
      from: socket.userId,
    })
  })

  // Handle disconnect
  socket.on("disconnect", (reason) => {
    console.log(`User ${socket.user.name} disconnected: ${reason}`)

    // Remove user from online users
    onlineUsers.delete(socket.userId)

    // Update user's last seen
    User.findByIdAndUpdate(socket.userId, { lastSeen: new Date() }).catch((error) =>
      console.error("Error updating last seen:", error),
    )

    // Emit updated online users list
    io.emit("online_users", { users: Array.from(onlineUsers.keys()) })

    // Notify others that user is offline
    socket.broadcast.emit("user_offline", { userId: socket.userId })
  })

  // Handle errors
  socket.on("error", (error) => {
    console.error(`Socket error for user ${socket.user.name}:`, error)
  })
})

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/bookings", bookingRoutes)
app.use("/api/developer-slots", developerSlotRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/posts", postRoutes)
app.use("/api/connections", connectionRoutes)
app.use("/api/messages", chatRoutes)

// Enhanced health check endpoint
app.get("/api/health", (req, res) => {
  const uptime = process.uptime()
  const memoryUsage = process.memoryUsage()

  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(uptime / 60)} minutes`,
    connectedUsers: onlineUsers.size,
    memoryUsage: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`,
    },
    environment: process.env.NODE_ENV || "development",
  })
})

// Get online users endpoint with enhanced info
app.get("/api/online-users", (req, res) => {
  const onlineUsersArray = Array.from(onlineUsers.values()).map((user) => ({
    userId: user.user._id,
    name: user.user.name,
    avatar: user.user.avatar,
    role: user.user.role,
    lastSeen: user.lastSeen,
    connectedAt: user.connectedAt,
  }))

  res.json({
    success: true,
    onlineUsers: onlineUsersArray,
    count: onlineUsersArray.length,
    timestamp: new Date().toISOString(),
  })
})

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack)

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === "development"

  res.status(err.status || 500).json({
    success: false,
    message: err.message || "Something went wrong!",
    error: isDevelopment ? err.message : "Internal server error",
    timestamp: new Date().toISOString(),
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
    timestamp: new Date().toISOString(),
  })
})

const PORT = process.env.PORT || 5000

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
  console.log(`🔗 Client URL: ${process.env.CLIENT_URL || "https://dev-connect1.netlify.app"}`)
  console.log(`📊 Health check: http://192.168.0.106:${PORT}/api/health`)
})

// Graceful shutdown
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`)

  server.close(() => {
    console.log("✅ HTTP server closed")

    mongoose.connection.close(false, () => {
      console.log("✅ MongoDB connection closed")
      process.exit(0)
    })
  })

  // Force close after 10 seconds
  setTimeout(() => {
    console.error("❌ Could not close connections in time, forcefully shutting down")
    process.exit(1)
  }, 10000)
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"))
process.on("SIGINT", () => gracefulShutdown("SIGINT"))

process.on("unhandledRejection", (err, promise) => {
  console.error("❌ Unhandled Promise Rejection:", err.message)
  console.error("Promise:", promise)

  server.close(() => {
    process.exit(1)
  })
})

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err.message)
  console.error("Stack:", err.stack)

  server.close(() => {
    process.exit(1)
  })
})
