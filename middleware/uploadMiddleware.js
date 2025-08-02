const multer = require("multer")
const path = require("path")

// Configure multer for memory storage (for S3 upload)
const storage = multer.memoryStorage()

// File filter function
const fileFilter = (req, file, cb) => {
  // Check file type
  if (file.fieldname === "avatar") {
    // Avatar upload - only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Avatar must be an image file"), false)
    }
  } else if (file.fieldname === "images") {
    // Post images - only images
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"), false)
    }
  } else {
    cb(new Error("Unexpected field"), false)
  }
}

// Create multer upload middleware
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5, // Maximum 5 files
  },
  fileFilter: fileFilter,
})

// Specific middleware for different upload types
const uploadAvatar = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit for avatars
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Avatar must be an image file"), false)
    }
  },
})

const uploadPostImages = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
    files: 5, // Maximum 5 images per post
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true)
    } else {
      cb(new Error("Only image files are allowed"), false)
    }
  },
})

// Error handling middleware
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "File too large. Maximum size is 10MB.",
      })
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Too many files. Maximum is 5 files.",
      })
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected file field.",
      })
    }
  }

  if (error.message) {
    return res.status(400).json({
      success: false,
      message: error.message,
    })
  }

  next(error)
}

module.exports = {
  upload,
  uploadAvatar,
  uploadPostImages,
  handleUploadError,
}
