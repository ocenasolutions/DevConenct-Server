const mongoose = require("mongoose")

const postSchema = new mongoose.Schema(
  {
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 2000,
    },
    images: [
      {
        url: String,
        publicId: String, // Cloudinary public_id for deletion
      },
    ],
    likes: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        content: {
          type: String,
          required: true,
          maxlength: 500,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        editedAt: {
          type: Date,
        },
      },
    ],
    shares: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        message: {
          type: String,
          maxlength: 500,
        },
        sharedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    sharedPost: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
    },
    isShared: {
      type: Boolean,
      default: false,
    },
    visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "public",
    },
    tags: [String],
    views: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
)

// Virtual for like count
postSchema.virtual("likeCount").get(function () {
  return this.likes.length
})

// Virtual for comment count
postSchema.virtual("commentCount").get(function () {
  return this.comments.length
})

// Virtual for share count
postSchema.virtual("shareCount").get(function () {
  return this.shares.length
})

// Index for better query performance
postSchema.index({ author: 1, createdAt: -1 })
postSchema.index({ visibility: 1, createdAt: -1 })
postSchema.index({ isActive: 1, createdAt: -1 })
postSchema.index({ createdAt: -1 }) // For feed sorting

// Ensure virtual fields are serialized
postSchema.set("toJSON", { virtuals: true })

module.exports = mongoose.model("Post", postSchema)
