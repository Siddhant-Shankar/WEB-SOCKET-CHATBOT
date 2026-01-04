const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGODB_URI || process.env.DATABASE_URL)
  .then(() => {
    console.log('✅ Database connected successfully!');
    console.log('Database name:', mongoose.connection.name);
    mongoose.connection.close();
  })
  .catch(err => {
    console.error('❌ Database connection failed:', err.message);
  });