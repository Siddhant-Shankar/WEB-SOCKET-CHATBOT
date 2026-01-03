import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true
    },
    content: {
      type: String,
      required: function() {
        return this.messageType === "text";
      },
      trim: true,
      maxlength: 5000
    },
    messageType: {
      type: String,
      enum: ["text", "image", "file", "system"],
      default: "text"
    },
    attachments: [{
      fileUrl: { type: String },
      fileName: { type: String },
      fileSize: { type: Number },
      mimeType: { type: String }
    }],
    readBy: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      readAt: {
        type: Date,
        default: Date.now
      }
    }],
    isEdited: {
      type: Boolean,
      default: false
    },
    editedAt: {
      type: Date
    },
    isDeleted: {
      type: Boolean,
      default: false
    },
    deletedAt: {
      type: Date
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    }
  },
  { 
    timestamps: true 
  }
);

// Compound index for efficient querying of messages in a conversation
messageSchema.index({ conversation: 1, createdAt: -1 });

// Index for finding unread messages
messageSchema.index({ "readBy.user": 1 });

// Method to mark message as read by a user
messageSchema.methods.markAsRead = function(userId) {
  const alreadyRead = this.readBy.some(
    read => read.user.toString() === userId.toString()
  );
  
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
  }
  
  return this.save();
};

// Method to check if message is read by a specific user
messageSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(
    read => read.user.toString() === userId.toString()
  );
};

// Method to soft delete a message
messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.content = "This message was deleted";
  return this.save();
};

// Method to edit message
messageSchema.methods.editMessage = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

// Static method to get unread count for a user in a conversation
messageSchema.statics.getUnreadCount = function(conversationId, userId) {
  return this.countDocuments({
    conversation: conversationId,
    sender: { $ne: userId },
    "readBy.user": { $ne: userId },
    isDeleted: false
  });
};

// Static method to get recent messages for a conversation
messageSchema.statics.getRecentMessages = function(conversationId, limit = 50) {
  return this.find({ 
    conversation: conversationId,
    isDeleted: false 
  })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate("sender", "name netId status")
    .populate("replyTo", "content sender");
};

export default mongoose.model("Message", messageSchema);