const express = require('express');
const router = express.Router();

const authenticateToken = require('../middleware/authenticateToken');
const authorizeRoles = require('../middleware/authorizeRoles');

// Example protected admin route
router.get(
  '/dashboard',
  authenticateToken,
  authorizeRoles('admin'),
  (req, res) => {
    res.json({ message: `Welcome Admin ${req.user.email}` });
  }
);

module.exports = router;
