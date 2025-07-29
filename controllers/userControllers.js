const User = require("../models/User")

exports.getProfile = async (req, res) => {
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
      user,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch profile",
      error: error.message,
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
      user,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to update profile",
      error: error.message,
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
    const { id } = req.params

    // Validate ObjectId format
    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID format",
      })
    }

    const user = await User.findById(id).select("-password")
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
    res.status(500).json({
      success: false,
      message: "Failed to fetch user",
      error: error.message,
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
    const { avatar } = req.body

    const user = await User.findById(req.user.userId)
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.avatar = avatar
    await user.save()

    res.json({
      success: true,
      message: "Avatar uploaded successfully",
      avatar: user.avatar,
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to upload avatar",
      error: error.message,
    })
  }
}
