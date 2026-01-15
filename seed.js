const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const dotenv = require("dotenv");
const User = require("./models/user");
const Product = require("./models/product");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Successfully connected to MongoDB...");
  })
  .catch((err) => {
    console.error("❌ Error connecting to MongoDB:", err);
  });

const seedDatabase = async () => {
  try {
    console.log("✅ Data added to MongoDB successfully!");
    mongoose.connection.close();
  } catch (error) {
    console.error("❌ An error occurred:", error);
    mongoose.connection.close();
  }
};

seedDatabase();
