const express = require('express');
const cors = require('cors');
require('dotenv').config();


const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

// Example route
app.get('/', (req, res) => {
  res.send(`Welcome to the ${process.env.NODE_ENV} backend of the Kooulu`);
});

const userRoutes = require('./routes/userRoutes');
app.use('/api/users', userRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
