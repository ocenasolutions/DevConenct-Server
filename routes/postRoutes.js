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
router.delete("/:id", postController.deletePost)

// Post interaction routes
router.post("/:id/like", postController.toggleLike)
router.post("/:id/comment", postController.addComment)
router.post("/:id/share", postController.sharePost)

module.exports = router
