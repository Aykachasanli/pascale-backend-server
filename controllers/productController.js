const Product = require("../models/product");
const jwt = require("jsonwebtoken");
const upload = require("../unitils/uploadMiddleware");
const { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } = require("../unitils/cloudinaryConfig");
const fs = require("fs");

const isAdmin = (token) => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.role === "admin";
  } catch (err) {
    return false;
  }
};

const getProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.send(products);
  } catch (error) {
    res.status(500).send("Error: getProducts " + error.message);
  }
};

const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).send("Product not found");

    res.send(product);
  } catch (error) {
    res.status(500).send("Error: getProductById " + error.message);
  }
};

const addProduct = async (req, res) => {
  const token = req.headers["authorization"];
  const userIsAdmin = isAdmin(token);

  if (!userIsAdmin) {
    return res.status(403).send("You do not have permission for this operation");
  }

  upload.single("productImage")(req, res, async (err) => {
    if (err) return res.status(400).send({ message: err.message });

    const { name, details, price } = req.body;

    try {
      let productImageUrl = null;

      if (req.file) {
        const uploadResult = await uploadToCloudinary(req.file.path, "products");
        
        if (uploadResult.success) {
          productImageUrl = uploadResult.url;
          fs.unlinkSync(req.file.path);
        } else {
          return res.status(500).send("Error uploading image to Cloudinary");
        }
      }

      const newProduct = new Product({
        name,
        details,
        price,
        productImage: productImageUrl,
      });

      await newProduct.save();
      res.send(newProduct);
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).send("Error: addProduct " + error.message);
    }
  });
};

const updateProduct = async (req, res) => {
  const token = req.headers["authorization"];
  const userIsAdmin = isAdmin(token);

  if (!userIsAdmin) {
    return res.status(403).send("You do not have permission for this operation");
  }

  upload.single("productImage")(req, res, async (err) => {
    if (err) return res.status(400).send({ message: err.message });

    try {
      const { name, details, price } = req.body;
      const product = await Product.findById(req.params.id);
      if (!product) return res.status(404).send("Product not found");

      product.name = name || product.name;
      product.details = details || product.details;
      product.price = price || product.price;

      if (req.file) {
        if (product.productImage) {
          const publicId = extractPublicIdFromUrl(product.productImage);
          if (publicId) {
            await deleteFromCloudinary(publicId);
          }
        }

        const uploadResult = await uploadToCloudinary(req.file.path, "products");
        
        if (uploadResult.success) {
          product.productImage = uploadResult.url;
          fs.unlinkSync(req.file.path);
        } else {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).send("Error uploading image to Cloudinary");
        }
      }

      await product.save();
      res.send(product);
    } catch (error) {
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).send("Error: updateProduct " + error.message);
    }
  });
};

const deleteProduct = async (req, res) => {
  const token = req.headers["authorization"];
  const userIsAdmin = isAdmin(token);

  if (!userIsAdmin) {
    return res.status(403).send("You do not have permission for this operation");
  }
  
  try {
    const product = await Product.findById(req.params.id);
    
    if (product && product.productImage) {
      const publicId = extractPublicIdFromUrl(product.productImage);
      if (publicId) {
        await deleteFromCloudinary(publicId);
      }
    }
    
    await Product.findByIdAndDelete(req.params.id);
    res.send({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).send("Error: deleteProduct " + error.message);
  }
};

module.exports = {
  getProducts,
  getProductById,
  addProduct,
  updateProduct,
  deleteProduct,
};
