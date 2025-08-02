const express = require("express")
const router = express.Router()
const postController = require("../controllers/postControllers")
const authMiddleware = require("../middleware/authMiddleware")
const { uploadPostImages, handleUploadError } = require("../middleware/uploadMiddleware")

// All routes are protected
router.use(authMiddleware)

// Post routes
router.post("/", uploadPostImages.array("images", 5), handleUploadError, postController.createPost)
router.get("/feed", postController.getFeed)
router.get("/my-posts", postController.getMyPosts)
router.get("/my-stats", postController.getMyStats)
router.get("/:id", postController.getPost)
router.delete("/:id", postController.deletePost)

// Post interaction routes
router.post("/:id/like", postController.toggleLike)
router.post("/:id/comment", postController.addComment)
router.post("/:id/share", postController.sharePost)
router.get("/:id/shares", postController.getPostShares)

// Comment routes
router.delete("/:postId/comments/:commentId", postController.deleteComment)
router.put("/:postId/comments/:commentId", postController.editComment)

module.exports = router
