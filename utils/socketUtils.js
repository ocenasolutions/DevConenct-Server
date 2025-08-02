// Utility functions for socket operations
const emitToUser = (io, userId, event, data) => {
  io.to(`user_${userId}`).emit(event, data)
}

const emitToUsers = (io, userIds, event, data) => {
  userIds.forEach((userId) => {
    io.to(`user_${userId}`).emit(event, data)
  })
}

const emitToRoom = (io, room, event, data) => {
  io.to(room).emit(event, data)
}

const getUserSocketId = (connectedUsers, userId) => {
  return connectedUsers.get(userId.toString())
}

const isUserOnline = (connectedUsers, userId) => {
  return connectedUsers.has(userId.toString())
}

module.exports = {
  emitToUser,
  emitToUsers,
  emitToRoom,
  getUserSocketId,
  isUserOnline,
}
