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
        key: String, // S3 key for deletion
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
      },
    ],
    shares: [
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
    visibility: {
      type: String,
      enum: ["public", "friends", "private"],
      default: "public",
    },
    tags: [String],
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

// Ensure virtual fields are serialized
postSchema.set("toJSON", { virtuals: true })

module.exports = mongoose.model("Post", postSchema)
