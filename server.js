const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const socketIo = require("socket.io")
const jwt = require("jsonwebtoken")
const path = require("path")

// Load environment variables
dotenv.config()

// Import routes
const authRoutes = require("./routes/authRoutes")
const userRoutes = require("./routes/userRoutes")
const bookingRoutes = require("./routes/bookingRoutes")
const developerSlotRoutes = require("./routes/developerSlotRoutes")
const notificationRoutes = require("./routes/notificationRoutes")
const chatRoutes = require("./routes/chatRoutes")

const Message = require("./models/Message")
const User = require("./models/User")

const postRoutes = require("./routes/postRoutes")
const connectionRoutes = require("./routes/connectionRoutes") 

const app = express()
const server = http.createServer(app)

// Socket.io setup with CORS
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
})

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
)
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use("/uploads", express.static(path.join(__dirname, "uploads")))

mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/devconnect", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB"))
  .catch((error) => {
    console.error("MongoDB connection error:", error)
    process.exit(1)
  })

// Socket.io authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    const userId = socket.handshake.auth.userId

    if (!token) {
      return next(new Error("Authentication error: No token provided"))
    }

    // Verify JWT token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Get user from database
    const user = await User.findById(decoded.userId || decoded.id).select("-password")

    if (!user) {
      return next(new Error("Authentication error: User not found"))
    }

    // Attach user to socket
    socket.userId = user._id.toString()
    socket.user = user

    console.log(`User authenticated: ${user.name} (${user._id})`)
    next()
  } catch (error) {
    console.error("Socket authentication error:", error.message)
    next(new Error("Authentication error: Invalid token"))
  }
})

// Store online users
const onlineUsers = new Map()

io.on("connection", (socket) => {
  console.log(`User connected: ${socket.user.name} (${socket.userId})`)

  // Add user to online users
  onlineUsers.set(socket.userId, {
    socketId: socket.id,
    user: socket.user,
    lastSeen: new Date(),
  })

  // Join user to their own room
  socket.join(socket.userId)

  // Broadcast online users to all clients
  io.emit("onlineUsers", Array.from(onlineUsers.keys()))

  // Notify others that user came online
  socket.broadcast.emit("userOnline", socket.userId)

  // Handle sending messages
  socket.on("sendMessage", async (messageData) => {
    try {
      console.log("Received sendMessage event:", messageData)

      if (!messageData || !messageData.receiver || !messageData.content) {
        console.error("Invalid message data:", messageData)
        socket.emit("messageError", { error: "Invalid message data" })
        return
      }

      const receiverId = messageData.receiver._id || messageData.receiver

      // Emit to receiver
      socket.to(receiverId).emit("newMessage", messageData)

      // Emit delivery confirmation to sender
      socket.emit("messageDelivered", {
        messageId: messageData._id,
        timestamp: new Date(),
      })

      console.log(`Message sent from ${socket.userId} to ${receiverId}`)
    } catch (error) {
      console.error("Error handling sendMessage:", error)
      socket.emit("messageError", { error: "Failed to send message" })
    }
  })

  // Handle typing indicators
  socket.on("typing", ({ receiverId, isTyping }) => {
    try {
      if (receiverId && typeof isTyping === "boolean") {
        socket.to(receiverId).emit("typing", {
          userId: socket.userId,
          isTyping,
        })
        console.log(`Typing indicator: ${socket.userId} -> ${receiverId} (${isTyping})`)
      }
    } catch (error) {
      console.error("Error handling typing:", error)
    }
  })

  // Handle message read receipts
  socket.on("messagesRead", async ({ otherUserId, readBy }) => {
    try {
      console.log(`Messages read by ${readBy} from ${otherUserId}`)

      // Update messages in database
      await Message.updateMany(
        {
          sender: otherUserId,
          receiver: readBy,
          read: false,
        },
        {
          read: true,
          readAt: new Date(),
        },
      )

      // Notify the sender that their messages were read
      socket.to(otherUserId).emit("messageRead", {
        readBy,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error("Error handling messagesRead:", error)
    }
  })

  // Handle user disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.user.name} (${socket.userId})`)

    // Remove user from online users
    onlineUsers.delete(socket.userId)

    // Broadcast updated online users list
    io.emit("onlineUsers", Array.from(onlineUsers.keys()))

    // Notify others that user went offline
    socket.broadcast.emit("userOffline", socket.userId)
  })

  // Handle connection errors
  socket.on("error", (error) => {
    console.error(`Socket error for user ${socket.userId}:`, error)
  })
})

// Routes
app.use("/api/auth", authRoutes)
app.use("/api/users", userRoutes)
app.use("/api/bookings", bookingRoutes)
app.use("/api/developer-slots", developerSlotRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/chat", chatRoutes)
app.use("/api/posts", postRoutes)
app.use("/api/connections", connectionRoutes)

// Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() })
})

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Server error:", error)
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? error.message : undefined,
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  })
})

const PORT = process.env.PORT || 5000

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`)
  console.log(`Socket.io server ready`)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  server.close(() => {
    console.log("Process terminated")
    mongoose.connection.close()
  })
})

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully")
  server.close(() => {
    console.log("Process terminated")
    mongoose.connection.close()
  })
})

module.exports = { app, server, io }
