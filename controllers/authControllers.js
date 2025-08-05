const User = require("../models/User")
const jwt = require("jsonwebtoken")
const bcrypt = require("bcryptjs")
const { OAuth2Client } = require("google-auth-library")

// Initialize Google OAuth client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI || `${process.env.CLIENT_URL}/auth/google/callback`,
)

// Generate JWT token
const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || "7d",
  })
}

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password",
      })
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      })
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: email.toLowerCase() })
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists with this email",
      })
    }

    // Create user with default role as developer
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase(),
      password,
      role: "developer", // Default role
      lastLogin: new Date(),
    })

    // Generate token
    const token = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toJSON()

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: userResponse,
    })
  } catch (error) {
    console.error("Register error:", error)

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message)
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors,
      })
    }

    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      })
    }

    // Find user and include password
    const user = await User.findOne({
      email: email.toLowerCase(),
      isActive: true,
    }).select("+password")

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      })
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password)
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      })
    }

    // Update last login
    user.lastLogin = new Date()
    await user.save()

    // Generate token
    const token = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toJSON()

    res.json({
      success: true,
      message: "Login successful",
      token,
      user: userResponse,
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getCurrentUser = async (req, res) => {
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
    console.error("Get current user error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
const logout = async (req, res) => {
  try {
    // In a real app, you might want to blacklist the token
    // For now, we'll just send a success response
    // The client should remove the token from storage

    res.json({
      success: true,
      message: "Logged out successfully",
    })
  } catch (error) {
    console.error("Logout error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Google OAuth
// @route   POST /api/auth/google
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { token, profile } = req.body

    if (!token || !profile) {
      return res.status(400).json({
        success: false,
        message: "Google token and profile are required",
      })
    }

    const { email, name, picture, sub } = profile

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google profile data",
      })
    }

    // Check if user exists
    let user = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { providerId: sub, authProvider: "google" }],
    })

    if (user) {
      // Update existing user
      user.lastLogin = new Date()
      if (!user.avatar && picture) {
        user.avatar = picture
      }
      await user.save()
    } else {
      // Create new user with default role
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase(),
        avatar: picture || null,
        authProvider: "google",
        providerId: sub,
        role: "developer", // Default role
        isVerified: true, // Google accounts are pre-verified
        lastLogin: new Date(),
      })
    }

    // Generate token
    const jwtToken = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toJSON()

    res.json({
      success: true,
      message: "Google authentication successful",
      token: jwtToken,
      user: userResponse,
    })
  } catch (error) {
    console.error("Google auth error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Google OAuth Callback
// @route   POST /api/auth/google/callback
// @access  Public
const googleCallback = async (req, res) => {
  try {
    const { code, role = "developer", isLogin = true } = req.body

    console.log("Google callback received:", { code: code ? "present" : "missing", role, isLogin })

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Authorization code is required",
      })
    }

    // Verify environment variables
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      console.error("Missing Google OAuth credentials")
      return res.status(500).json({
        success: false,
        message: "Server configuration error",
      })
    }

    // Set up OAuth2 client with credentials
    const oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || `${process.env.CLIENT_URL}/auth/google/callback`,
    )

    // Exchange authorization code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    // Get user info from Google
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    })

    const payload = ticket.getPayload()
    const { sub, email, name, picture } = payload

    console.log("Google user info:", { sub, email, name, picture: picture ? "present" : "missing" })

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google profile data",
      })
    }

    // Check if user exists
    let user = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { providerId: sub, authProvider: "google" }],
    })

    if (user) {
      // Update existing user
      user.lastLogin = new Date()
      if (!user.avatar && picture) {
        user.avatar = picture
      }
      await user.save()
      console.log("Updated existing user:", user.email)
    } else {
      // Create new user
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase(),
        avatar: picture || null,
        authProvider: "google",
        providerId: sub,
        role: role || "developer",
        isVerified: true,
        lastLogin: new Date(),
      })
      console.log("Created new user:", user.email)
    }

    // Generate JWT token
    const jwtToken = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toJSON()

    res.json({
      success: true,
      message: "Google authentication successful",
      token: jwtToken,
      user: userResponse,
    })
  } catch (error) {
    console.error("Google callback error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

// @desc    LinkedIn OAuth
// @route   POST /api/auth/linkedin
// @access  Public
const linkedinAuth = async (req, res) => {
  try {
    const { token, profile } = req.body

    if (!token || !profile) {
      return res.status(400).json({
        success: false,
        message: "LinkedIn token and profile are required",
      })
    }

    const { email, name, picture, id } = profile

    if (!email || !name) {
      return res.status(400).json({
        success: false,
        message: "Invalid LinkedIn profile data",
      })
    }

    // Check if user exists
    let user = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { providerId: id, authProvider: "linkedin" }],
    })

    if (user) {
      // Update existing user
      user.lastLogin = new Date()
      if (!user.avatar && picture) {
        user.avatar = picture
      }
      await user.save()
    } else {
      // Create new user with default role
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase(),
        avatar: picture || null,
        authProvider: "linkedin",
        providerId: id,
        role: "developer", // Default role
        isVerified: true, // LinkedIn accounts are pre-verified
        lastLogin: new Date(),
      })
    }

    // Generate token
    const jwtToken = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toJSON()

    res.json({
      success: true,
      message: "LinkedIn authentication successful",
      token: jwtToken,
      user: userResponse,
    })
  } catch (error) {
    console.error("LinkedIn auth error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Change password
// @route   PUT /api/auth/password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      })
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters",
      })
    }

    // Get user with password
    const user = await User.findById(req.user.userId).select("+password")

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    // Check if user uses local authentication
    if (user.authProvider !== "local" || !user.password) {
      return res.status(400).json({
        success: false,
        message: "Password change not available for social login accounts",
      })
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword)
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      })
    }

    // Update password
    user.password = newPassword
    await user.save()

    res.json({
      success: true,
      message: "Password changed successfully",
    })
  } catch (error) {
    console.error("Change password error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Update user role
// @route   PUT /api/auth/role
// @access  Private
const updateRole = async (req, res) => {
  try {
    const { role } = req.body

    if (!role || !["developer", "recruiter", "company"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "Valid role is required (developer, recruiter, or company)",
      })
    }

    const user = await User.findById(req.user.userId)

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      })
    }

    user.role = role
    await user.save()

    // Remove password from response
    const userResponse = user.toJSON()

    res.json({
      success: true,
      message: "Role updated successfully",
      user: userResponse,
    })
  } catch (error) {
    console.error("Update role error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

const linkedinCallback = async (req, res) => {
  try {
    const { code, role = "developer", isLogin = true } = req.body

    console.log("LinkedIn callback received:", { 
      code: code ? "present" : "missing", 
      codeLength: code ? code.length : 0,
      role, 
      isLogin 
    })

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Authorization code is required",
      })
    }

    // Verify environment variables
    const clientId = process.env.LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
    const redirectUri = process.env.LINKEDIN_REDIRECT_URI || `${process.env.CLIENT_URL}/auth/linkedin/callback`

    console.log("LinkedIn OAuth config:", {
      clientId: clientId ? `${clientId.substring(0, 8)}...` : "missing",
      clientSecret: clientSecret ? "present" : "missing",
      redirectUri
    })

    if (!clientId || !clientSecret) {
      console.error("Missing LinkedIn OAuth credentials")
      return res.status(500).json({
        success: false,
        message: "Server configuration error: Missing LinkedIn credentials",
      })
    }

    // Exchange authorization code for access token
    console.log("Exchanging code for token...")
    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      }),
    })

    console.log("Token response status:", tokenResponse.status)

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("LinkedIn token exchange failed:", errorText)
      
      let errorMessage = "Failed to exchange authorization code"
      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.error_description || errorJson.error || errorMessage
      } catch (e) {
        // Error text is not JSON, use as is
        errorMessage = errorText || errorMessage
      }

      return res.status(400).json({
        success: false,
        message: errorMessage,
      })
    }

    const tokenData = await tokenResponse.json()
    console.log("Token data received:", {
      access_token: tokenData.access_token ? "present" : "missing",
      expires_in: tokenData.expires_in
    })

    const accessToken = tokenData.access_token

    // Get user profile from LinkedIn using the correct endpoint
    console.log("Fetching user profile...")
    const profileResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "X-Restli-Protocol-Version": "2.0.0"
      },
    })

    console.log("Profile response status:", profileResponse.status)

    if (!profileResponse.ok) {
      const errorText = await profileResponse.text()
      console.error("Failed to fetch LinkedIn profile:", errorText)
      return res.status(400).json({
        success: false,
        message: "Failed to fetch user profile from LinkedIn",
      })
    }

    const profile = await profileResponse.json()
    console.log("LinkedIn profile received:", {
      sub: profile.sub,
      email: profile.email,
      name: profile.name,
      picture: profile.picture ? "present" : "missing"
    })

    const { sub, email, name, picture } = profile

    if (!email || !name) {
      console.error("Invalid LinkedIn profile data:", profile)
      return res.status(400).json({
        success: false,
        message: "Invalid LinkedIn profile data - missing email or name",
      })
    }

    // Check if user exists
    let user = await User.findOne({
      $or: [
        { email: email.toLowerCase() }, 
        { providerId: sub, authProvider: "linkedin" }
      ],
    })

    if (user) {
      // Update existing user
      user.lastLogin = new Date()
      if (!user.avatar && picture) {
        user.avatar = picture
      }
      // Update provider info if missing
      if (!user.providerId || !user.authProvider) {
        user.providerId = sub
        user.authProvider = "linkedin"
      }
      await user.save()
      console.log("Updated existing LinkedIn user:", user.email)
    } else {
      // Create new user
      user = await User.create({
        name: name.trim(),
        email: email.toLowerCase(),
        avatar: picture || null,
        authProvider: "linkedin",
        providerId: sub,
        role: role || "developer",
        isVerified: true,
        lastLogin: new Date(),
      })
      console.log("Created new LinkedIn user:", user.email)
    }

    // Generate JWT token
    const jwtToken = generateToken(user._id)

    // Remove password from response
    const userResponse = user.toJSON()

    console.log("LinkedIn authentication successful for:", user.email)

    res.json({
      success: true,
      message: "LinkedIn authentication successful",
      token: jwtToken,
      user: userResponse,
    })
  } catch (error) {
    console.error("LinkedIn callback error:", error)
    res.status(500).json({
      success: false,
      message: "Server error: " + error.message,
    })
  }
}

module.exports = {
  register,
  login,
  getCurrentUser,
  logout,
  googleAuth,
  googleCallback,
  linkedinAuth,
  changePassword,
  linkedinCallback,
  updateRole,
}
