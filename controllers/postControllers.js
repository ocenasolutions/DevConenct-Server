const Post = require("../models/Post")
const User = require("../models/User")
const Connection = require("../models/Connection")
const { createNotification } = require("./notificationControllers")
const AWS = require("aws-sdk")

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
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
        const key = `posts/${req.user.userId}/${Date.now()}-${file.originalname}`

        const uploadParams = {
          Bucket: process.env.AWS_S3_BUCKET,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: "public-read",
        }

        const result = await s3.upload(uploadParams).promise()
        images.push({
          url: result.Location,
          key: key,
        })
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

// @desc    Get posts for feed
// @route   GET /api/posts/feed
// @access  Private
const getFeed = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query
    const userId = req.user.userId

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

    // Include user's own posts and connected users' posts
    const allowedAuthors = [userId, ...connectedUserIds]

    const posts = await Post.find({
      $and: [
        { isActive: true },
        {
          $or: [
            { visibility: "public" },
            { author: userId }, // User's own posts
            { author: { $in: connectedUserIds }, visibility: "friends" },
          ],
        },
      ],
    })
      .populate("author", "name avatar role")
      .populate("likes.user", "name avatar")
      .populate("comments.user", "name avatar")
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)

    const total = await Post.countDocuments({
      $and: [
        { isActive: true },
        {
          $or: [
            { visibility: "public" },
            { author: userId },
            { author: { $in: connectedUserIds }, visibility: "friends" },
          ],
        },
      ],
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
        await createNotification(post.author, "like", "New Like", `${req.user.name} liked your post`, {
          postId: post._id,
          userId: req.user.userId,
        })
      }
    }

    await post.save()
    await post.populate("likes.user", "name avatar")

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

    // Create notification for post author (if not self-comment)
    if (post.author.toString() !== req.user.userId.toString()) {
      await createNotification(post.author, "comment", "New Comment", `${req.user.name} commented on your post`, {
        postId: post._id,
        userId: req.user.userId,
      })
    }

    res.json({
      success: true,
      message: "Comment added successfully",
      comment: post.comments[post.comments.length - 1],
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
    const post = await Post.findById(req.params.id)

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

    post.shares.push({ user: req.user.userId })
    await post.save()

    // Create notification for post author (if not self-share)
    if (post.author.toString() !== req.user.userId.toString()) {
      await createNotification(post.author, "share", "Post Shared", `${req.user.name} shared your post`, {
        postId: post._id,
        userId: req.user.userId,
      })
    }

    res.json({
      success: true,
      message: "Post shared successfully",
      shareCount: post.shares.length,
    })
  } catch (error) {
    console.error("Share post error:", error)
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

    // Delete images from S3
    if (post.images && post.images.length > 0) {
      const deleteParams = {
        Bucket: process.env.AWS_S3_BUCKET,
        Delete: {
          Objects: post.images.map((img) => ({ Key: img.key })),
        },
      }

      await s3.deleteObjects(deleteParams).promise()
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

module.exports = {
  createPost,
  getFeed,
  getMyPosts,
  toggleLike,
  addComment,
  sharePost,
  deletePost,
}
