import jwt from "jsonwebtoken";

const JWT_SECRET = "0cb725671bc4be96df1319027e43654bad3d2180c64c3ada3ce4f17c9ba99fce14ba1eb2f357e2dbb9bb8af31676d987e817ce1b3d5f2ba9e35a1eb6f8f82b86"; // Same as above

export function verifyAdmin(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ message: "Invalid token" });

    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Not authorized" });
    }

    next();
  });
}
