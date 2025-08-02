const User = require("../models/User")
const AWS = require("aws-sdk")

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
})

exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      user,
    })
  } catch (error) {
    console.error("Get profile error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const { name, profile, preferences } = req.body

    const user = await User.findById(req.user.userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Update fields
    if (name) user.name = name
    if (profile) user.profile = { ...user.profile, ...profile }
    if (preferences) user.preferences = { ...user.preferences, ...preferences }

    await user.save()

    res.json({
      success: true,
      message: "Profile updated successfully",
      user: user.toJSON(),
    })
  } catch (error) {
    console.error("Update profile error:", error)
    res.status(500).json({
      success: false,
      message: error.message || "Server error",
    })
  }
}

// Get profile completion percentage
exports.getProfileCompletion = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      completion: user.profileCompletion || 0,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to get profile completion",
      error: error.message,
    })
  }
}

// Get all users (for recruiters) - renamed from getUsers to avoid confusion
exports.getUsers = async (req, res) => {
  try {
    const { role, skills, location, page = 1, limit = 10 } = req.query

    const query = { isActive: true }
    if (role) query.role = role
    if (location) query["profile.location"] = new RegExp(location, "i")
    if (skills) {
      const skillsArray = skills.split(",")
      query["profile.skills"] = { $in: skillsArray.map((skill) => new RegExp(skill, "i")) }
    }

    const users = await User.find(query)
      .select("-password")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })

    const total = await User.countDocuments(query)

    res.json({
      success: true,
      users,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch users",
      error: error.message,
    })
  }
}

// Get user by ID
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    res.json({
      success: true,
      user,
    })
  } catch (error) {
    console.error("Get user by ID error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// Delete user account
exports.deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    await User.findByIdAndDelete(req.user.userId)

    res.json({
      success: true,
      message: "Account deleted successfully",
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to delete account",
      error: error.message,
    })
  }
}

// Upload avatar
exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      })
    }

    const user = await User.findById(req.user.userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Delete old avatar from S3 if exists
    if (user.avatar && user.avatar.includes("amazonaws.com")) {
      const oldKey = user.avatar.split("/").pop()
      await s3
        .deleteObject({
          Bucket: process.env.AWS_S3_BUCKET,
          Key: `avatars/${oldKey}`,
        })
        .promise()
    }

    // Upload new avatar to S3
    const key = `avatars/${req.user.userId}-${Date.now()}-${req.file.originalname}`

    const uploadParams = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
      ACL: "public-read",
    }

    const result = await s3.upload(uploadParams).promise()

    // Update user avatar
    user.avatar = result.Location
    await user.save()

    res.json({
      success: true,
      message: "Avatar uploaded successfully",
      avatar: result.Location,
    })
  } catch (error) {
    console.error("Upload avatar error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// Search users
exports.searchUsers = async (req, res) => {
  try {
    const { query, role, skills, location, page = 1, limit = 20 } = req.query

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: "Search query must be at least 2 characters long",
      })
    }

    const searchQuery = {
      isActive: true,
      $or: [
        { name: { $regex: query, $options: "i" } },
        { "profile.bio": { $regex: query, $options: "i" } },
        { "profile.skills": { $regex: query, $options: "i" } },
      ],
    }

    // Add filters
    if (role && role !== "all") {
      searchQuery.role = role
    }

    if (skills) {
      const skillsArray = skills.split(",").map((skill) => skill.trim())
      searchQuery["profile.skills"] = { $in: skillsArray }
    }

    if (location) {
      searchQuery["profile.location"] = { $regex: location, $options: "i" }
    }

    const users = await User.find(searchQuery)
      .select("name avatar role profile.location profile.bio profile.skills")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })

    const total = await User.countDocuments(searchQuery)

    // Add connection status for each user if authenticated
    let usersWithStatus = users
    if (req.user) {
      const Connection = require("../models/Connection")
      const currentUserId = req.user.userId

      usersWithStatus = await Promise.all(
        users.map(async (user) => {
          if (user._id.toString() === currentUserId.toString()) {
            return { ...user.toObject(), connectionStatus: "self" }
          }

          const connection = await Connection.findOne({
            $or: [
              { requester: currentUserId, recipient: user._id },
              { requester: user._id, recipient: currentUserId },
            ],
          })

          let status = "none"
          if (connection) {
            if (connection.status === "accepted") {
              status = "connected"
            } else if (connection.status === "pending") {
              status = connection.requester.toString() === currentUserId.toString() ? "sent" : "received"
            }
          }

          return { ...user.toObject(), connectionStatus: status }
        }),
      )
    }

    res.json({
      success: true,
      users: usersWithStatus,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Search users error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// Get developers
exports.getDevelopers = async (req, res) => {
  try {
    const { skills, location, experience, page = 1, limit = 20 } = req.query

    const query = {
      role: "developer",
      isActive: true,
    }

    // Add filters
    if (skills) {
      const skillsArray = skills.split(",").map((skill) => skill.trim())
      query["profile.skills"] = { $in: skillsArray }
    }

    if (location) {
      query["profile.location"] = { $regex: location, $options: "i" }
    }

    if (experience) {
      query["profile.experience"] = { $exists: true, $not: { $size: 0 } }
    }

    const developers = await User.find(query)
      .select("name avatar profile.bio profile.skills profile.location profile.experience profile.ratings")
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ "profile.ratings.overall": -1, createdAt: -1 })

    const total = await User.countDocuments(query)

    res.json({
      success: true,
      developers,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalDevelopers: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Get developers error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}
