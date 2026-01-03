import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 1,
      maxlength: 100
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    isPrivate: {
      type: Boolean,
      default: false
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true
    },
    members: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
      },
      role: {
        type: String,
        enum: ["owner", "admin", "member"],
        default: "member"
      },
      joinedAt: {
        type: Date,
        default: Date.now
      }
    }],
    maxMembers: {
      type: Number,
      default: 100,
      min: 2,
      max: 1000
    },
    category: {
      type: String,
      enum: ["academic", "social", "housing", "sports", "clubs", "general"],
      default: "general"
    },
    isActive: {
      type: Boolean,
      default: true
    },
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  { 
    timestamps: true 
  }
);

// Indexes for efficient queries
roomSchema.index({ isPrivate: 1, isActive: 1 });
roomSchema.index({ "members.user": 1 });
roomSchema.index({ category: 1 });
roomSchema.index({ lastActivity: -1 });

// Generate unique invite code for private rooms
roomSchema.methods.generateInviteCode = function() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  this.inviteCode = code;
  return this.save();
};

// Add a member to the room
roomSchema.methods.addMember = function(userId, role = "member") {
  const isMember = this.members.some(
    m => m.user.toString() === userId.toString()
  );
  
  if (isMember) {
    throw new Error("User is already a member of this room");
  }
  
  if (this.members.length >= this.maxMembers) {
    throw new Error("Room has reached maximum capacity");
  }
  
  this.members.push({
    user: userId,
    role: role,
    joinedAt: new Date()
  });
  
  return this.save();
};

// Remove a member from the room
roomSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(
    m => m.user.toString() !== userId.toString()
  );
  return this.save();
};

// Update member role
roomSchema.methods.updateMemberRole = function(userId, newRole) {
  const member = this.members.find(
    m => m.user.toString() === userId.toString()
  );
  
  if (!member) {
    throw new Error("User is not a member of this room");
  }
  
  member.role = newRole;
  return this.save();
};

// Check if user is a member
roomSchema.methods.isMember = function(userId) {
  return this.members.some(
    m => m.user.toString() === userId.toString()
  );
};

// Check if user is owner or admin
roomSchema.methods.isAdminOrOwner = function(userId) {
  const member = this.members.find(
    m => m.user.toString() === userId.toString()
  );
  return member && (member.role === "owner" || member.role === "admin");
};

// Get member count
roomSchema.methods.getMemberCount = function() {
  return this.members.length;
};

// Update last activity timestamp
roomSchema.methods.updateActivity = function() {
  this.lastActivity = new Date();
  return this.save();
};

// Static method to find public rooms
roomSchema.statics.findPublicRooms = function(limit = 20) {
  return this.find({ 
    isPrivate: false,
    isActive: true 
  })
    .sort({ lastActivity: -1 })
    .limit(limit)
    .populate("createdBy", "name netId")
    .select("-inviteCode");
};

// Static method to find rooms by category
roomSchema.statics.findByCategory = function(category, limit = 20) {
  return this.find({ 
    category: category,
    isPrivate: false,
    isActive: true 
  })
    .sort({ lastActivity: -1 })
    .limit(limit)
    .populate("createdBy", "name netId");
};

// Static method to find room by invite code
roomSchema.statics.findByInviteCode = function(code) {
  return this.findOne({ 
    inviteCode: code,
    isPrivate: true,
    isActive: true 
  })
    .populate("createdBy", "name netId")
    .populate("members.user", "name netId status");
};

// Static method to find user's rooms
roomSchema.statics.findUserRooms = function(userId) {
  return this.find({ 
    "members.user": userId,
    isActive: true 
  })
    .sort({ lastActivity: -1 })
    .populate("createdBy", "name netId")
    .populate("members.user", "name netId status");
};

export default mongoose.model("Room", roomSchema);