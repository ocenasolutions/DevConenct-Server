const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const dotenv = require("dotenv")
const http = require("http")
const socketIo = require("socket.io")
const path = require("path")

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

// Import middleware
const authMiddleware = require("./middleware/authMiddleware")

const app = express()
const server = http.createServer(app)

// Socket.IO setup
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || "https://melodic-sawine-ac9059.netlify.app/0",
    methods: ["GET", "POST"],
    credentials: true,
  },
})

// Store io instance in app for use in controllers
app.set("io", io)

// Middleware
app.use(express.json({ limit: "10mb" }))
app.use(express.urlencoded({ extended: true, limit: "10mb" }))

// CORS configuration
app.use(
  cors({
    origin: process.env.CLIENT_URL || "https://melodic-sawine-ac9059.netlify.app/0",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
)

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")))

// Database connection
mongoose
  .connect(process.env.MONGODB_URI || "mongodb://localhost:27017/rite", {
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

// Socket.IO connection handling
io.on("connection", (socket) => {
  console.log("User connected:", socket.id)

  // Join user to their personal room
  socket.on("join", (userId) => {
    socket.join(userId)
    console.log(`User ${userId} joined room`)
  })

  // Handle real-time messaging
  socket.on("send_message", async (data) => {
    try {
      const { receiverId, content, senderId } = data

      // Emit to receiver
      socket.to(receiverId).emit("receive_message", {
        senderId,
        content,
        timestamp: new Date(),
      })
    } catch (error) {
      console.error("Socket message error:", error)
    }
  })

  // Handle typing indicators
  socket.on("typing", (data) => {
    socket.to(data.receiverId).emit("user_typing", {
      senderId: data.senderId,
      isTyping: data.isTyping,
    })
  })

  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id)
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
app.use("/api/messages", chatRoutes) // Changed from /api/chat to /api/messages

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
  })
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err.stack)
  res.status(500).json({
    success: false,
    message: "Something went wrong!",
    error: process.env.NODE_ENV === "development" ? err.message : "Internal server error",
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
  console.log(`Environment: ${process.env.NODE_ENV || "development"}`)
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
