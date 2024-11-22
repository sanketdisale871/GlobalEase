const express = require("express");
const router = express.Router();

const userController = require("../controllers/user");
const { requireUserAuth } = require("../middleware/auth");

router.get("/", requireUserAuth, userController.renderDashboard);
router.get("/globalEaseGPT", requireUserAuth, userController.renderChat);
router.get("/portals", requireUserAuth, userController.renderPortals);

router.get("/login", userController.renderLogin);
router.get("/register", userController.renderRegister);

module.exports = router;
