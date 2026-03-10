import express from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
const db = require("../config/db");

const router = express.Router();

const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD_HASH = "$2b$10$vVh1WRN8lW6ZTG0VT3fSGeuonxn1wP0o4j9Dlbb6t5cfTU2/2jS6u"; // Replace with generated hash
const JWT_SECRET = process.env.JWT_SECRET;

router.post("/login", async (req, res) => {
    console.log("📩 Login Request:", req.body);
  
    const { username, password } = req.body;
  
    const [rows] = await db.query("SELECT * FROM admins WHERE username = ?", [username]);
    console.log("🔍 DB Result:", rows);
  
    const admin = rows[0];
  
    if (!admin) {
      console.log("❌ USER NOT FOUND");
      return res.status(401).json({ message: "Invalid Credentials" });
    }
  
    const isMatch = await bcrypt.compare(password, admin.password);
    console.log("🔐 Password Match:", isMatch);
  
    if (!isMatch) {
      console.log("❌ WRONG PASSWORD");
      return res.status(401).json({ message: "Invalid Credentials" });
    }
  
    const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET, { expiresIn: "1h" });
  
    console.log("✅ Login Success");
    res.json({ token });
  });
  

export default router;
