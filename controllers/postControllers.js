const Post = require("../models/Post")
const User = require("../models/User")
const Connection = require("../models/Connection")
const { createNotification } = require("./notificationControllers")
const { emitToUser } = require("../utils/socketUtils")
const cloudinary = require("cloudinary").v2

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

// @desc    Create a new post
// @route   POST /api/posts
// @access  Private
const createPost = async (req, res) => {
  try {
    const { content, visibility = "public", tags = [] } = req.body

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Post content is required",
      })
    }

    const images = []

    // Handle image uploads if any
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        try {
          // Convert buffer to base64
          const base64String = file.buffer.toString("base64")
          const dataURI = `data:${file.mimetype};base64,${base64String}`

          // Upload to Cloudinary
          const result = await cloudinary.uploader.upload(dataURI, {
            folder: `rite/posts/${req.user.userId}`,
            resource_type: "auto",
            transformation: [
              { width: 1200, height: 1200, crop: "limit" },
              { quality: "auto" },
              { fetch_format: "auto" },
            ],
          })

          images.push({
            url: result.secure_url,
            publicId: result.public_id,
          })
        } catch (uploadError) {
          console.error("Cloudinary upload error:", uploadError)
          return res.status(500).json({
            success: false,
            message: "Error uploading image",
          })
        }
      }
    }

    const post = new Post({
      author: req.user.userId,
      content: content.trim(),
      images,
      visibility,
      tags: Array.isArray(tags) ? tags : tags.split(",").map((tag) => tag.trim()),
    })

    await post.save()
    await post.populate("author", "name avatar role")

    res.status(201).json({
      success: true,
      message: "Post created successfully",
      post,
    })
  } catch (error) {
    console.error("Create post error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get a single post
// @route   GET /api/posts/:id
// @access  Private
const getPost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)
      .populate("author", "name avatar role")
      .populate("likes.user", "name avatar")
      .populate("comments.user", "name avatar")
      .populate("shares.user", "name avatar")

    if (!post || !post.isActive) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    // Check if user has permission to view this post
    const userId = req.user.userId
    if (post.visibility === "private" && post.author._id.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this post",
      })
    }

    if (post.visibility === "friends" && post.author._id.toString() !== userId.toString()) {
      // Check if users are connected
      const connection = await Connection.findOne({
        $or: [
          { requester: userId, recipient: post.author._id, status: "accepted" },
          { requester: post.author._id, recipient: userId, status: "accepted" },
        ],
      })

      if (!connection) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view this post",
        })
      }
    }

    // Increment view count if not the author
    if (post.author._id.toString() !== userId.toString()) {
      post.views = (post.views || 0) + 1
      await post.save()
    }

    res.json({
      success: true,
      post,
    })
  } catch (error) {
    console.error("Get post error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get posts for feed (Dashboard)
// @route   GET /api/posts/feed
// @access  Private
const getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 10, filter = "all" } = req.query
    const userId = req.user.userId

    const query = { isActive: true }

    if (filter === "friends") {
      // Get user's connections
      const connections = await Connection.find({
        $or: [
          { requester: userId, status: "accepted" },
          { recipient: userId, status: "accepted" },
        ],
      })

      const connectedUserIds = connections.map((conn) =>
        conn.requester.toString() === userId.toString() ? conn.recipient : conn.requester,
      )

      // Show posts from connected friends and user's own posts
      query.$or = [
        { author: { $in: connectedUserIds }, visibility: { $in: ["public", "friends"] } },
        { author: userId },
      ]
    } else {
      // For "all" filter, show public posts from everyone and user's own posts
      query.$or = [{ visibility: "public" }, { author: userId }]
    }

    const posts = await Post.find(query)
      .populate("author", "name avatar role")
      .populate("likes.user", "name avatar")
      .populate("comments.user", "name avatar")
      .populate("shares.user", "name avatar")
      .populate({
        path: "sharedPost",
        populate: {
          path: "author",
          select: "name avatar role",
        },
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Post.countDocuments(query)

    res.json({
      success: true,
      posts,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalPosts: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Get feed error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get user's posts
// @route   GET /api/posts/my-posts
// @access  Private
const getMyPosts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query

    const posts = await Post.find({
      author: req.user.userId,
      isActive: true,
    })
      .populate("author", "name avatar role")
      .populate("likes.user", "name avatar")
      .populate("comments.user", "name avatar")
      .populate("shares.user", "name avatar")
      .populate({
        path: "sharedPost",
        populate: {
          path: "author",
          select: "name avatar role",
        },
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Post.countDocuments({
      author: req.user.userId,
      isActive: true,
    })

    res.json({
      success: true,
      posts,
      pagination: {
        currentPage: Number.parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalPosts: total,
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    })
  } catch (error) {
    console.error("Get my posts error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Like/Unlike a post
// @route   POST /api/posts/:id/like
// @access  Private
const toggleLike = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    const existingLike = post.likes.find((like) => like.user.toString() === req.user.userId.toString())

    if (existingLike) {
      // Unlike
      post.likes = post.likes.filter((like) => like.user.toString() !== req.user.userId.toString())
    } else {
      // Like
      post.likes.push({ user: req.user.userId })

      // Create notification for post author (if not self-like)
      if (post.author.toString() !== req.user.userId.toString()) {
        await createNotification(
          post.author,
          "like",
          "New Like",
          `${req.user.name} liked your post`,
          {
            postId: post._id,
            userId: req.user.userId,
          },
          req,
        )
      }
    }

    await post.save()
    await post.populate("likes.user", "name avatar")

    // Emit real-time update to post author
    if (!existingLike && post.author.toString() !== req.user.userId.toString()) {
      const io = req.app.get("io")
      if (io) {
        emitToUser(io, post.author, "post_liked", {
          postId: post._id,
          likedBy: {
            _id: req.user.userId,
            name: req.user.name,
            avatar: req.user.avatar,
          },
          likeCount: post.likes.length,
        })
      }
    }

    res.json({
      success: true,
      liked: !existingLike,
      likeCount: post.likes.length,
      likes: post.likes,
    })
  } catch (error) {
    console.error("Toggle like error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Add comment to post
// @route   POST /api/posts/:id/comment
// @access  Private
const addComment = async (req, res) => {
  try {
    const { content } = req.body

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      })
    }

    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    const comment = {
      user: req.user.userId,
      content: content.trim(),
    }

    post.comments.push(comment)
    await post.save()
    await post.populate("comments.user", "name avatar")

    const newComment = post.comments[post.comments.length - 1]

    // Create notification for post author (if not self-comment)
    if (post.author.toString() !== req.user.userId.toString()) {
      await createNotification(
        post.author,
        "comment",
        "New Comment",
        `${req.user.name} commented on your post`,
        {
          postId: post._id,
          userId: req.user.userId,
        },
        req,
      )

      // Emit real-time update to post author
      const io = req.app.get("io")
      if (io) {
        emitToUser(io, post.author, "post_commented", {
          postId: post._id,
          comment: newComment,
          commentCount: post.comments.length,
        })
      }
    }

    res.json({
      success: true,
      message: "Comment added successfully",
      comment: newComment,
      commentCount: post.comments.length,
    })
  } catch (error) {
    console.error("Add comment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Share a post
// @route   POST /api/posts/:id/share
// @access  Private
const sharePost = async (req, res) => {
  try {
    const { message = "" } = req.body
    const post = await Post.findById(req.params.id).populate("author", "name avatar")

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    const existingShare = post.shares.find((share) => share.user.toString() === req.user.userId.toString())

    if (existingShare) {
      return res.status(400).json({
        success: false,
        message: "Post already shared",
      })
    }

    // Add share to the original post
    post.shares.push({
      user: req.user.userId,
      message: message.trim(),
      sharedAt: new Date(),
    })
    await post.save()

    // Create a new shared post
    const sharedPost = new Post({
      author: req.user.userId,
      content: message.trim() || `Shared a post from ${post.author.name}`,
      sharedPost: post._id,
      visibility: "public",
      isShared: true,
    })

    await sharedPost.save()
    await sharedPost.populate([
      { path: "author", select: "name avatar role" },
      {
        path: "sharedPost",
        select: "content images author createdAt",
        populate: {
          path: "author",
          select: "name avatar role",
        },
      },
    ])

    // Create notification for original post author (if not self-share)
    if (post.author._id.toString() !== req.user.userId.toString()) {
      await createNotification(
        post.author._id,
        "share",
        "Post Shared",
        `${req.user.name} shared your post`,
        {
          postId: post._id,
          sharedPostId: sharedPost._id,
          userId: req.user.userId,
        },
        req,
      )

      // Emit real-time update to post author
      const io = req.app.get("io")
      if (io) {
        emitToUser(io, post.author._id, "post_shared", {
          postId: post._id,
          sharedPostId: sharedPost._id,
          sharedBy: {
            _id: req.user.userId,
            name: req.user.name,
            avatar: req.user.avatar,
          },
          shareCount: post.shares.length,
          message: message.trim(),
        })
      }
    }

    // Notify user's connections about the shared post
    const connections = await Connection.find({
      $or: [
        { requester: req.user.userId, status: "accepted" },
        { recipient: req.user.userId, status: "accepted" },
      ],
    })

    const connectedUserIds = connections.map((conn) =>
      conn.requester.toString() === req.user.userId.toString() ? conn.recipient : conn.requester,
    )

    // Emit to connected users about new shared post
    const io = req.app.get("io")
    if (io) {
      connectedUserIds.forEach((userId) => {
        emitToUser(io, userId, "new_shared_post", {
          post: sharedPost,
          sharedBy: {
            _id: req.user.userId,
            name: req.user.name,
            avatar: req.user.avatar,
          },
        })
      })
    }

    res.json({
      success: true,
      message: "Post shared successfully",
      shareCount: post.shares.length,
      sharedPost: sharedPost,
    })
  } catch (error) {
    console.error("Share post error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get post shares
// @route   GET /api/posts/:id/shares
// @access  Private
const getPostShares = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id).populate("shares.user", "name avatar role")

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    res.json({
      success: true,
      shares: post.shares,
      shareCount: post.shares.length,
    })
  } catch (error) {
    console.error("Get post shares error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Private
const deletePost = async (req, res) => {
  try {
    const post = await Post.findById(req.params.id)

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    // Check if user is the author
    if (post.author.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this post",
      })
    }

    // Delete images from Cloudinary
    if (post.images && post.images.length > 0) {
      for (const image of post.images) {
        try {
          await cloudinary.uploader.destroy(image.publicId)
        } catch (deleteError) {
          console.error("Error deleting image from Cloudinary:", deleteError)
        }
      }
    }

    await Post.findByIdAndDelete(req.params.id)

    res.json({
      success: true,
      message: "Post deleted successfully",
    })
  } catch (error) {
    console.error("Delete post error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Delete a comment
// @route   DELETE /api/posts/:postId/comments/:commentId
// @access  Private
const deleteComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params
    const post = await Post.findById(postId)

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    const comment = post.comments.id(commentId)
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      })
    }

    // Check if user is the comment author or post author
    if (
      comment.user.toString() !== req.user.userId.toString() &&
      post.author.toString() !== req.user.userId.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this comment",
      })
    }

    post.comments.pull(commentId)
    await post.save()

    res.json({
      success: true,
      message: "Comment deleted successfully",
      commentCount: post.comments.length,
    })
  } catch (error) {
    console.error("Delete comment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Edit a comment
// @route   PUT /api/posts/:postId/comments/:commentId
// @access  Private
const editComment = async (req, res) => {
  try {
    const { postId, commentId } = req.params
    const { content } = req.body

    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: "Comment content is required",
      })
    }

    const post = await Post.findById(postId)

    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      })
    }

    const comment = post.comments.id(commentId)
    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Comment not found",
      })
    }

    // Check if user is the comment author
    if (comment.user.toString() !== req.user.userId.toString()) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to edit this comment",
      })
    }

    comment.content = content.trim()
    comment.editedAt = new Date()
    await post.save()
    await post.populate("comments.user", "name avatar")

    res.json({
      success: true,
      message: "Comment updated successfully",
      comment: comment,
    })
  } catch (error) {
    console.error("Edit comment error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

// @desc    Get post statistics for user
// @route   GET /api/posts/my-stats
// @access  Private
const getMyStats = async (req, res) => {
  try {
    const userId = req.user.userId

    const posts = await Post.find({ author: userId, isActive: true })

    const stats = {
      totalPosts: posts.length,
      totalLikes: posts.reduce((sum, post) => sum + post.likes.length, 0),
      totalComments: posts.reduce((sum, post) => sum + post.comments.length, 0),
      totalShares: posts.reduce((sum, post) => sum + post.shares.length, 0),
      totalViews: posts.reduce((sum, post) => sum + (post.views || 0), 0),
      averageEngagement:
        posts.length > 0
          ? (
              posts.reduce((sum, post) => sum + post.likes.length + post.comments.length + post.shares.length, 0) /
              posts.length
            ).toFixed(2)
          : 0,
    }

    res.json({
      success: true,
      stats,
    })
  } catch (error) {
    console.error("Get my stats error:", error)
    res.status(500).json({
      success: false,
      message: "Server error",
    })
  }
}

module.exports = {
  createPost,
  getPost,
  getFeed,
  getMyPosts,
  toggleLike,
  addComment,
  sharePost,
  getPostShares,
  deletePost,
  deleteComment,
  editComment,
  getMyStats,
}
