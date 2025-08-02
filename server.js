const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const socketIo = require("socket.io")
const jwt = require("jsonwebtoken")

// Load environment variables
dotenv.config()

// Import routes
const authRoutes = require("./routes/authRoutes")
const userRoutes = require("./routes/userRoutes")
const bookingRoutes = require("./routes/bookingRoutes")
const developerSlotRoutes = require("./routes/developerSlotRoutes")
const notificationRoutes = require("./routes/notificationRoutes")
const chatRoutes = require("./routes/chatRoutes")
const postRoutes = require("./routes/postRoutes")
const connectionRoutes = require("./routes/connectionRoutes")

const app = express()
const server = http.createServer(app)

// Socket.io setup
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true,
  },
})

// Store connected users
const connectedUsers = new Map()

// Socket authentication middleware
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth.token
    if (!token) {
      return next(new Error("Authentication error"))
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const User = require("./models/User")
    const user = await User.findById(decoded.userId).select("-password")

    if (!user) {
      return next(new Error("User not found"))
    }

    socket.userId = user._id.toString()
    socket.user = user
    next()
  } catch (error) {
    next(new Error("Authentication error"))
  }
})

// Socket connection handling
io.on("connection", (socket) => {
  console.log(`User ${socket.user.name} connected: ${socket.id}`)

  // Store user connection
  connectedUsers.set(socket.userId, socket.id)
  socket.join(`user_${socket.userId}`)

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log(`User ${socket.user.name} disconnected: ${socket.id}`)
    connectedUsers.delete(socket.userId)
  })

  // Handle typing events for chat
  socket.on("typing", (data) => {
    socket.to(`chat_${data.chatId}`).emit("user_typing", {
      userId: socket.userId,
      userName: socket.user.name,
      isTyping: data.isTyping,
    })
  })

  // Handle joining chat rooms
  socket.on("join_chat", (chatId) => {
    socket.join(`chat_${chatId}`)
    console.log(`User ${socket.user.name} joined chat: ${chatId}`)
  })

  // Handle leaving chat rooms
  socket.on("leave_chat", (chatId) => {
    socket.leave(`chat_${chatId}`)
    console.log(`User ${socket.user.name} left chat: ${chatId}`)
  })
})

// Make io accessible to routes
app.set("io", io)
app.set("connectedUsers", connectedUsers)

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  }),
)
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

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
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    connectedUsers: connectedUsers.size,
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  })
})

// 404 handler
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
  })
})

// Database connection
mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => {
    console.log("Connected to MongoDB")
    const PORT = process.env.PORT || 5000
    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
    })
  })
  .catch((error) => {
    console.error("Database connection error:", error)
    process.exit(1)
  })

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully")
  server.close(() => {
    mongoose.connection.close()
    process.exit(0)
  })
})
