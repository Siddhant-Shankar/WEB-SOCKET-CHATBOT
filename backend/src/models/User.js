import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      validate: {
        validator: (v) => typeof v === "string" && v.toLowerCase().endsWith("@illinois.edu"),
        message: "Email must be from @illinois.edu domain"
      }
    },
    googleId: { type: String, unique: true, sparse: true },
    name: { type: String, required: true, trim: true },
    status: { type: String, enum: ["online", "offline"], default: "offline" },
    lastSeen: { type: Date, default: Date.now }, 
    netId: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
    trim: true
    }
  },
  { timestamps: true }
);

userSchema.index({ status: 1 });

userSchema.methods.getPublicProfile = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    status: this.status,
    lastSeen: this.lastSeen,
    netId: this.netId
  };
};

userSchema.statics.findOnlineUsers = function () {
  return this.find({ status: "online" });
};

export default mongoose.model("User", userSchema);