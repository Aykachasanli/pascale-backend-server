const mongoose = require("mongoose");
const dotenv = require("dotenv");
const User = require("./models/user");
const Product = require("./models/product");
const { uploadToCloudinary } = require("./unitils/cloudinaryConfig");
const fs = require("fs");
const path = require("path");

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

const migrateImagesToCloudinary = async () => {
  try {
    console.log("🚀 Starting image migration to Cloudinary...\n");

    const products = await Product.find();
    console.log(`📦 Found ${products.length} products to migrate`);

    for (const product of products) {
      if (product.productImage && product.productImage.startsWith("uploads/")) {
        const localPath = product.productImage;
        
        if (fs.existsSync(localPath)) {
          console.log(`⬆️  Uploading: ${path.basename(localPath)}`);
          
          const uploadResult = await uploadToCloudinary(localPath, "products");
          
          if (uploadResult.success) {
            product.productImage = uploadResult.url;
            await product.save();
            console.log(`✅ Updated product: ${product.name}`);
          } else {
            console.error(`❌ Failed to upload: ${localPath}`);
          }
        } else {
          console.log(`⚠️  File not found: ${localPath}`);
        }
      } else if (product.productImage && product.productImage.startsWith("https://res.cloudinary.com")) {
        console.log(`✓ Product "${product.name}" already using Cloudinary`);
      }
    }

    console.log("\n");
    const users = await User.find();
    console.log(`👤 Found ${users.length} users to check`);

    for (const user of users) {
      if (user.profileImage && user.profileImage.startsWith("uploads/")) {
        const localPath = user.profileImage;
        
        if (fs.existsSync(localPath)) {
          console.log(`⬆️  Uploading profile image: ${path.basename(localPath)}`);
          
          const uploadResult = await uploadToCloudinary(localPath, "profiles");
          
          if (uploadResult.success) {
            user.profileImage = uploadResult.url;
            await user.save();
            console.log(`✅ Updated user: ${user.name} ${user.surname}`);
          } else {
            console.error(`❌ Failed to upload: ${localPath}`);
          }
        } else {
          console.log(`⚠️  File not found: ${localPath}`);
        }
      } else if (user.profileImage && user.profileImage.startsWith("https://res.cloudinary.com")) {
        console.log(`✓ User "${user.name}" already using Cloudinary`);
      }
    }

    console.log("\n✅ Migration completed successfully!");
    console.log("📝 All database records updated with Cloudinary URLs");
    mongoose.connection.close();
  } catch (error) {
    console.error("❌ Migration error:", error);
    mongoose.connection.close();
  }
};

migrateImagesToCloudinary();
