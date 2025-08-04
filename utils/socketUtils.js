// Utility functions for Socket.IO operations

/**
 * Emit event to a specific user
 * @param {Object} io - Socket.IO instance
 * @param {String} userId - Target user ID
 * @param {String} event - Event name
 * @param {Object} data - Data to send
 */
const emitToUser = (io, userId, event, data) => {
  try {
    io.to(`user_${userId}`).emit(event, data)
    console.log(`Emitted ${event} to user ${userId}`)
  } catch (error) {
    console.error(`Error emitting ${event} to user ${userId}:`, error)
  }
}

/**
 * Emit event to a specific room
 * @param {Object} io - Socket.IO instance
 * @param {String} roomId - Target room ID
 * @param {String} event - Event name
 * @param {Object} data - Data to send
 */
const emitToRoom = (io, roomId, event, data) => {
  try {
    io.to(roomId).emit(event, data)
    console.log(`Emitted ${event} to room ${roomId}`)
  } catch (error) {
    console.error(`Error emitting ${event} to room ${roomId}:`, error)
  }
}

/**
 * Broadcast event to all connected users except sender
 * @param {Object} socket - Socket instance
 * @param {String} event - Event name
 * @param {Object} data - Data to send
 */
const broadcastToAll = (socket, event, data) => {
  try {
    socket.broadcast.emit(event, data)
    console.log(`Broadcasted ${event} to all users`)
  } catch (error) {
    console.error(`Error broadcasting ${event}:`, error)
  }
}

/**
 * Join user to a specific room
 * @param {Object} socket - Socket instance
 * @param {String} roomId - Room ID to join
 */
const joinRoom = (socket, roomId) => {
  try {
    socket.join(roomId)
    console.log(`Socket ${socket.id} joined room ${roomId}`)
  } catch (error) {
    console.error(`Error joining room ${roomId}:`, error)
  }
}

/**
 * Leave a specific room
 * @param {Object} socket - Socket instance
 * @param {String} roomId - Room ID to leave
 */
const leaveRoom = (socket, roomId) => {
  try {
    socket.leave(roomId)
    console.log(`Socket ${socket.id} left room ${roomId}`)
  } catch (error) {
    console.error(`Error leaving room ${roomId}:`, error)
  }
}

/**
 * Get all rooms a socket is in
 * @param {Object} socket - Socket instance
 * @returns {Array} Array of room names
 */
const getSocketRooms = (socket) => {
  try {
    return Array.from(socket.rooms)
  } catch (error) {
    console.error("Error getting socket rooms:", error)
    return []
  }
}

/**
 * Get number of clients in a room
 * @param {Object} io - Socket.IO instance
 * @param {String} roomId - Room ID
 * @returns {Number} Number of clients in room
 */
const getRoomSize = async (io, roomId) => {
  try {
    const room = io.sockets.adapter.rooms.get(roomId)
    return room ? room.size : 0
  } catch (error) {
    console.error(`Error getting room size for ${roomId}:`, error)
    return 0
  }
}

/**
 * Check if user is online
 * @param {Map} connectedUsers - Map of connected users
 * @param {String} userId - User ID to check
 * @returns {Boolean} True if user is online
 */
const isUserOnline = (connectedUsers, userId) => {
  try {
    return connectedUsers.has(userId)
  } catch (error) {
    console.error(`Error checking if user ${userId} is online:`, error)
    return false
  }
}

/**
 * Get online users list
 * @param {Map} connectedUsers - Map of connected users
 * @returns {Array} Array of online user IDs
 */
const getOnlineUsers = (connectedUsers) => {
  try {
    return Array.from(connectedUsers.keys())
  } catch (error) {
    console.error("Error getting online users:", error)
    return []
  }
}

/**
 * Format user status for client
 * @param {Object} userInfo - User information
 * @returns {Object} Formatted user status
 */
const formatUserStatus = (userInfo) => {
  try {
    return {
      userId: userInfo.user._id,
      name: userInfo.user.name,
      avatar: userInfo.user.avatar,
      status: userInfo.status,
      lastSeen: userInfo.lastSeen,
    }
  } catch (error) {
    console.error("Error formatting user status:", error)
    return null
  }
}

module.exports = {
  emitToUser,
  emitToRoom,
  broadcastToAll,
  joinRoom,
  leaveRoom,
  getSocketRooms,
  getRoomSize,
  isUserOnline,
  getOnlineUsers,
  formatUserStatus,
}
