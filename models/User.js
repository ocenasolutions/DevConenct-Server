const mongoose = require("mongoose")
const bcrypt = require("bcryptjs")

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)@\w+([.-]?\w+)(\.\w{2,3})+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      minlength: [6, "Password must be at least 6 characters"],
      select: false,
    },
    avatar: {
      type: String,
      default: null,
    },
    role: {
      type: String,
      enum: ["developer", "recruiter", "company"],
      default: "developer",
    },
    profile: {
      bio: {
        type: String,
        maxlength: [500, "Bio cannot exceed 500 characters"],
      },
      skills: [
        {
          type: String,
          trim: true,
        },
      ],
      experience: [
        {
          title: {
            type: String,
            required: true,
            trim: true,
          },
          company: {
            type: String,
            required: true,
            trim: true,
          },
          duration: {
            type: String,
            trim: true,
          },
          description: {
            type: String,
            maxlength: [300, "Experience description cannot exceed 300 characters"],
          },
        },
      ],
      education: [
        {
          degree: {
            type: String,
            required: true,
            trim: true,
          },
          school: {
            type: String,
            required: true,
            trim: true,
          },
          year: {
            type: String,
            trim: true,
          },
        },
      ],
      portfolio: {
        type: String,
        validate: {
          validator: (v) => !v || /^https?:\/\/.+/.test(v),
          message: "Portfolio must be a valid URL",
        },
      },
      resume: {
        type: String,
      },
      location: {
        type: String,
        trim: true,
        maxlength: [100, "Location cannot exceed 100 characters"],
      },
      github: {
        type: String,
        validate: {
          validator: (v) => !v || /^https?:\/\/(www\.)?github\.com\/.+/.test(v),
          message: "GitHub must be a valid GitHub URL",
        },
      },
      linkedin: {
        type: String,
        validate: {
          validator: (v) => !v || /^https?:\/\/(www\.)?linkedin\.com\/in\/.+/.test(v),
          message: "LinkedIn must be a valid LinkedIn profile URL",
        },
      },
      website: {
        type: String,
        validate: {
          validator: (v) => !v || /^https?:\/\/.+/.test(v),
          message: "Website must be a valid URL",
        },
      },
      calendlyUsername: {
        type: String,
        trim: true,
        validate: {
          validator: (v) => !v || /^[a-zA-Z0-9_-]+$/.test(v),
          message: "Calendly username must contain only letters, numbers, hyphens, and underscores",
        },
      },
      ratings: {
        overall: {
          type: Number,
          default: 0,
          min: 0,
          max: 5,
        },
        skills: {
          type: Number,
          default: 0,
          min: 0,
          max: 5,
        },
        communication: {
          type: Number,
          default: 0,
          min: 0,
          max: 5,
        },
        punctuality: {
          type: Number,
          default: 0,
          min: 0,
          max: 5,
        },
        expertise: {
          type: Number,
          default: 0,
          min: 0,
          max: 5,
        },
        totalReviews: {
          type: Number,
          default: 0,
        },
      },
    },
    preferences: {
      jobType: [
        {
          type: String,
          enum: ["full-time", "part-time", "contract", "freelance", "internship"],
        },
      ],
      salaryRange: {
        min: {
          type: Number,
          min: [0, "Minimum salary cannot be negative"],
        },
        max: {
          type: Number,
          min: [0, "Maximum salary cannot be negative"],
        },
      },
      remoteWork: {
        type: Boolean,
        default: false,
      },
      preferredLocations: [
        {
          type: String,
          trim: true,
        },
      ],
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
      default: Date.now,
    },
    authProvider: {
      type: String,
      enum: ["local", "google", "linkedin", "github"], // Added "github" to the enum
      default: "local",
    },
    providerId: String,
    // OTP fields for email verification
    otp: {
      type: String,
      select: false,
    },
    otpExpires: {
      type: Date,
      select: false,
    },
    // Profile completion tracking
    profileCompletion: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true,
  },
)

// Indexes for better query performance
userSchema.index({ email: 1 })
userSchema.index({ role: 1 })
userSchema.index({ "profile.skills": 1 })
userSchema.index({ "profile.location": 1 })
userSchema.index({ isActive: 1 })
userSchema.index({ createdAt: -1 })

// Hash password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next()

  try {
    const salt = await bcrypt.genSalt(12)
    this.password = await bcrypt.hash(this.password, salt)
    next()
  } catch (error) {
    next(error)
  }
})

userSchema.pre("save", function (next) {
  let completed = 0
  const total = 13 // Updated total to include calendlyUsername

  if (this.name) completed++
  if (this.profile?.bio) completed++
  if (this.profile?.location) completed++
  if (this.profile?.skills && this.profile.skills.length > 0) completed++
  if (this.profile?.experience && this.profile.experience.length > 0) completed++
  if (this.profile?.education && this.profile.education.length > 0) completed++
  if (this.profile?.github) completed++
  if (this.profile?.linkedin) completed++
  if (this.profile?.portfolio || this.profile?.website) completed++
  if (this.profile?.calendlyUsername) completed++
  if (this.preferences?.jobType && this.preferences.jobType.length > 0) completed++
  if (this.preferences?.salaryRange?.min && this.preferences?.salaryRange?.max) completed++
  if (
    this.profile?.ratings?.overall &&
    this.profile?.ratings?.skills &&
    this.profile?.ratings?.communication &&
    this.profile?.ratings?.punctuality &&
    this.profile?.ratings?.expertise
  )
    completed++

  this.profileCompletion = Math.round((completed / total) * 100)
  next()
})

// Validate salary range
userSchema.pre("save", function (next) {
  if (this.preferences?.salaryRange?.min && this.preferences?.salaryRange?.max) {
    if (this.preferences.salaryRange.min > this.preferences.salaryRange.max) {
      return next(new Error("Minimum salary cannot be greater than maximum salary"))
    }
  }
  next()
})

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password)
}

// Hide sensitive data when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject()
  delete user.password
  delete user.otp
  delete user.otpExpires
  return user
}

// Static method to find developers with filters
userSchema.statics.findDevelopers = function (filters = {}) {
  const query = { role: "developer", isActive: true }

  if (filters.skills) {
    query["profile.skills"] = {
      $in: Array.isArray(filters.skills)
        ? filters.skills.map((skill) => new RegExp(skill, "i"))
        : [new RegExp(filters.skills, "i")],
    }
  }

  if (filters.location) {
    query["profile.location"] = new RegExp(filters.location, "i")
  }

  if (filters.minCompletion) {
    query.profileCompletion = { $gte: filters.minCompletion }
  }

  return this.find(query).select("-password")
}

userSchema.virtual("displayName").get(function () {
  return this.name || "Anonymous User"
})

userSchema.virtual("profileUrl").get(function () {
  return `/profile/${this._id}`
})

module.exports = mongoose.model("User", userSchema)