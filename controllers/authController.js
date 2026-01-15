const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const otpGenerator = require("otp-generator");
const nodemailer = require("nodemailer");
const User = require("../models/user");
const upload = require("../unitils/uploadMiddleware");
const { uploadToCloudinary, deleteFromCloudinary, extractPublicIdFromUrl } = require("../unitils/cloudinaryConfig");
const fs = require("fs");
require("dotenv").config();

const registerUser = async (req, res) => {
  const { name, surname, email, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  if (name.trim() === "")
    return res.status(400).send("First name is required");
  if (surname.trim() === "")
    return res.status(400).send("Surname is required");
  if (email.trim() === "")
    return res.status(400).send("Email is required");
  if (password.trim() === "")
    return res.status(400).send("Password is required");

  try {
    const newUser = new User({
      name,
      surname,
      email,
      password: hashedPassword,
      role: "user",
    });
    await newUser.save();
    res.send("User registration completed.");
  } catch (error) {
    res.status(500).send("Error registerUser: " + error.message);
  }
};

const loginUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).send("Invalid email or password");
    }
    if (!user.isActive) {
      return res
        .status(401)
        .send(
          "User profile is not active. Please reactivate your account."
        );
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1w" }
    );
    res.send({ token });
  } catch (error) {
    res.status(500).send("Error loginUser: " + error.message);
  }
};

const sendOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found");

    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    user.otp = otp;
    await user.save();

    sendOTPToEmail(email, otp);
    res.send(`OTP code sent to ${email}.`);
  } catch (error) {
    res.status(500).send("Error sendOTP: " + error.message);
  }
};

const sendOTPToEmail = (email, otp) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.USER_MAIL,
      pass: process.env.SECRET_KEY,
    }
  });
  const mailOptions = {
    from: "Backend Service",
    to: email,
    subject: "OTP Code",
    text: `Your OTP code: ${otp}`,
  };

  console.log(`[DEBUG] OTP for ${email}: ${otp}`);

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.error("❌ Email sending failed:", error.message);
    } else {
      console.log("✅ Email sent successfully:", info.response);
    }
  });
};

const changeProfileImage = async (req, res) => {
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");

    upload.single("profileImage")(req, res, async (err) => {
      if (err) return res.status(400).send("Şəkil yüklənmədi: " + err.message);

      if (!req.file) return res.status(400).send("No file uploaded");

      try {
        if (user.profileImage) {
          const publicId = extractPublicIdFromUrl(user.profileImage);
          if (publicId) {
            await deleteFromCloudinary(publicId);
          }
        }

        const uploadResult = await uploadToCloudinary(req.file.path, "profiles");
        
        if (uploadResult.success) {
          user.profileImage = uploadResult.url;
          fs.unlinkSync(req.file.path);
          await user.save();

          res.send({
            message: "Profile image changed successfully",
            profileImage: user.profileImage,
          });
        } else {
          if (fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
          }
          return res.status(500).send("Error uploading image to Cloudinary");
        }
      } catch (uploadError) {
        if (req.file && fs.existsSync(req.file.path)) {
          fs.unlinkSync(req.file.path);
        }
        res.status(500).send("Error: " + uploadError.message);
      }
    });
  } catch (error) {
    res.status(500).send("Error changeProfileImage: " + error.message);
  }
};

const getUserProfileData = async (req, res) => {
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");

    res.send({
      _id: user._id,
      name: user.name,
      surname: user.surname,
      email: user.email,
      profileImage: user.profileImage,
      role: user.role,
      phone: user.phone,
      address: user.address,
      age: user.age,
      registerDate: user.registerDate,
      isActive: user.isActive,
    });
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
};

const updateProfileData = async (req, res) => {
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");
    if (!user.isActive)
      return res
        .status(400)
        .send("User is not active. Please reactivate your account.");

    user.name = req.body.name || user.name;
    user.surname = req.body.surname || user.surname;

    if (req.body.email && req.body.email !== user.email) {

    }
    user.phone = req.body.phone || user.phone;
    user.address = req.body.address || user.address;
    user.age = req.body.age || user.age;
    await user.save();

    res.send({
      message: "User details updated successfully.",
      data: {
        _id: user._id,
        name: user.name,
        surname: user.surname,
        email: user.email,
        profileImage: user.profileImage,
        role: user.role,
        phone: user.phone,
        address: user.address,
        age: user.age,
        registerDate: user.registerDate,
        isActive: user.isActive,
      },
    });
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
};

const changeUserRole = async (req, res) => {
  const token = req.headers.authorization;
  const { user_id, role } = req.body;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.userId);
    const user = await User.findById(user_id);
    if (!admin) return res.status(404).send("User not found.");
    if (admin.role !== "admin")
      return res.status(404).send("You do not have permission for this operation.");
    if (!user) return res.status(404).send("User not found.");

    if (user.role === "admin" && role === "user") {
      if (
        String(admin.email).toLowerCase() !==
        String(process.env.USER_MAIL).toLowerCase()
      ) {
        return res
          .status(403)
          .send("Yalnızca Super Admin digər adminləri sıravi istifadəçiyə çevirə bilər.");
      }
    }

    user.role = role;
    await user.save();

    res.send({
      message: `Role changed for user ${user.name} ${
        user.surname
      }. User is now ${
        user.role === "admin" ? "Admin" : "Not Admin"
      }`,
    });
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
};

const changePassword = async (req, res) => {
  const { oldPassword, newPassword, email, otp } = req.body;
  const token = req.headers.authorization;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);
      if (!user) return res.status(404).send("User not found.");

      if (!bcrypt.compareSync(oldPassword, user.password)) {
        return res.status(401).send("Old password is incorrect.");
      }

      user.password = bcrypt.hashSync(newPassword, 10);
      await user.save();
      res.send("Password changed successfully");
    } catch (error) {
      res.status(500).send("Error changePassword: " + error.message);
    }
  } else if (email && otp) {
    try {
      const user = await User.findOne({ email });
      if (!user) return res.status(404).send("User not found.");

      if (user.otp !== otp) return res.status(401).send("Invalid OTP code");

      user.password = bcrypt.hashSync(newPassword, 10);
      user.otp = null;
      await user.save();

      res.send("Password changed successfully");
    } catch (error) {
      res.status(500).send("Error: " + error.message);
    }
  } else {
    res.status(400).send("Error: changePassword");
  }
};

const deleteUserAccount = async (req, res) => {
  const { otp } = req.body;
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");

    if (user.otp !== otp) return res.status(401).send("Invalid OTP code.");

    await User.findByIdAndDelete(user._id);

    res.send("User account deleted successfully.");
  } catch (error) {
    res.status(500).send("Error: deleteUserAccount " + error.message);
  }
};

const sendResetPasswordOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found.");

    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    user.otp = otp;
    await user.save();

    sendOTPToEmail(email, otp);
    res.send(`OTP code sent to ${email}.`);
  } catch (error) {
    res.status(500).send("Error: sendRequestPasswordOTP " + error.message);
  }
};

const deactivateUser = async (req, res) => {
  const { email } = req.body;
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");
    if (
      String(user.email).toLocaleLowerCase() !==
      String(email).toLocaleLowerCase()
    )
      return res.status(404).send("Email address is incorrect");

    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    user.otp = otp;
    await user.save();

    sendOTPToEmail(email, otp);
    res.send(`OTP code sent to ${email}.`);
  } catch (error) {
    res.status(500).send("Error: deactivateUser " + error.message);
  }
};

const confirmUserDeactivation = async (req, res) => {
  const { otp } = req.body;
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");

    if (user.otp !== otp) return res.status(401).send("Invalid OTP code");

    user.isActive = false;
    user.otp = null;
    await user.save();

    res.send("User profile deactivated");
  } catch (error) {
    res.status(500).send("Error: confirmUserDeactivation " + error.message);
  }
};

const reactivateUser = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found.");
    if (user.isActive) return res.status(400).send("User is already active");

    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    user.otp = otp;
    await user.save();

    sendOTPToEmail(email, otp);
    res.send(`OTP code sent to ${email}.`);
  } catch (error) {
    res.status(500).send("Error: reactivateUser " + error.message);
  }
};

const confirmUserReactivation = async (req, res) => {
  const { email, otp } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found.");

    if (user.otp !== otp) return res.status(401).send("Invalid OTP code");

    user.isActive = true;
    user.otp = null;
    await user.save();

    res.send("User activated. Please log in to your account.");
  } catch (error) {
    res.status(500).send("Error: confirmUserReactivation " + error.message);
  }
};

const sendDeleteAccountOTP = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send("User not found.");

    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    user.otp = otp;
    await user.save();

    sendOTPToEmail(email, otp);
    res.send(`OTP code sent to ${email}.`);
  } catch (error) {
    res.status(500).send("Error: sendDeleteAccountOTP " + error.message);
  }
};

const getAllUserList = async (req, res) => {
  const token = req.headers.authorization;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const currentUser = await User.findById(decoded.userId);

    if (!currentUser || currentUser.role !== "admin") {
      return res.status(403).send("You do not have permission for this operation.");
    }

    const users = await User.find();
    const data = users.map((item) => ({
      _id: item._id,
      name: item.name,
      surname: item.surname,
      email: item.email,
      profileImage: item.profileImage,
      role: item.role,
      phone: item.phone,
      address: item.address,
      age: item.age,
      registerDate: item.registerDate,
      isActive: item.isActive,
    }));
    res.send(data);
  } catch (error) {
    res.status(500).send("Error: getAllUserList " + error.message);
  }
};
const initiateEmailChange = async (req, res) => {
  const token = req.headers.authorization;
  const { newEmail } = req.body;

  if (!token) return res.status(403).send("Invalid request details");
  if (!newEmail) return res.status(400).send("New email is required");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");

    const existingUser = await User.findOne({ email: newEmail });
    if (existingUser) return res.status(400).send("This email is already in use.");

    const otp = otpGenerator.generate(6, {
      alphabets: false,
      upperCase: false,
      specialChars: false,
    });
    
    user.pendingEmail = newEmail;
    user.otp = otp;
    await user.save();

    sendOTPToEmail(newEmail, otp);
    res.send({ message: `OTP code sent to ${newEmail}.` });
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
};

const confirmEmailChange = async (req, res) => {
  const token = req.headers.authorization;
  const { otp } = req.body;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    if (!user) return res.status(404).send("User not found.");

    if (user.otp !== otp) return res.status(401).send("Invalid OTP code");
    if (!user.pendingEmail) return res.status(400).send("Email change request not found");

    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.otp = null;
    await user.save();

    res.send({ message: "Email changed successfully.", email: user.email });
  } catch (error) {
    res.status(500).send("Error: " + error.message);
  }
};
const deleteUser = async (req, res) => {
  const token = req.headers.authorization;
  const { user_id } = req.body;

  if (!token) return res.status(403).send("Invalid request details");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await User.findById(decoded.userId);

    if (!admin || admin.role !== "admin") {
      return res.status(403).send("Sizin bu emeliyyata icazeniz yoxdur.");
    }

    if (
      String(admin.email).toLowerCase() !==
      String(process.env.USER_MAIL).toLowerCase()
    ) {
      return res
        .status(403)
        .send("Yalnızca Super Admin istifadəçiləri silə bilər.");
    }

    const userToDelete = await User.findById(user_id);
    if (!userToDelete) return res.status(404).send("İstifadəçi tapılmadı.");

    await User.findByIdAndDelete(user_id);

    res.send({ message: `İstifadəçi ${userToDelete.name} ${userToDelete.surname} uğurla silindi.` });
  } catch (error) {
    res.status(500).send("Error: deleteUser " + error.message);
  }
};

module.exports = {
  registerUser,
  loginUser,
  sendOTP,
  changeProfileImage,
  getUserProfileData,
  updateProfileData,
  confirmUserDeactivation,
  reactivateUser,
  confirmUserReactivation,
  changeUserRole,
  deactivateUser,
  getAllUserList,
  changePassword,
  sendResetPasswordOTP,
  deleteUserAccount,
  sendDeleteAccountOTP,
  initiateEmailChange,
  confirmEmailChange,
  deleteUser
};
