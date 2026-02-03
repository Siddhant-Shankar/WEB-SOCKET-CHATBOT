import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    }],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Message"
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    },
    unreadCount: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      count: {
        type: Number,
        default: 0
      }
    }],
    isArchived: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      archived: {
        type: Boolean,
        default: false
      }
    }],
    isPinned: [{
      user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
      },
      pinned: {
        type: Boolean,
        default: false
      }
    }],
    typingUsers: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    }]
  },
  { 
    timestamps: true 
  }
);

// Compound index to ensure unique conversations between users
conversationSchema.index({ participants: 1 }, { unique: true });

// Index for finding user's conversations sorted by activity
conversationSchema.index({ participants: 1, lastMessageAt: -1 });

// Validate that conversation has exactly 2 participants
conversationSchema.pre("save", function(next) {
  if (this.participants.length !== 2) {
    next(new Error("Conversation must have exactly 2 participants"));
  }
  
  // Initialize unreadCount for new conversations
  if (this.isNew) {
    this.unreadCount = this.participants.map(userId => ({
      user: userId,
      count: 0
    }));
    this.isArchived = this.participants.map(userId => ({
      user: userId,
      archived: false
    }));
    this.isPinned = this.participants.map(userId => ({
      user: userId,
      pinned: false
    }));
  }
  
  next();
});

conversationSchema.pre("validate", function(next) {
  if (this.participants && this.participants.length === 2) {
    this.participants = this.participants
      .map(id => id.toString())
      .sort()
      .map(id => new mongoose.Types.ObjectId(id));
  }
  next();
});

// Get the other participant in the conversation
conversationSchema.methods.getOtherParticipant = function(userId) {
  return this.participants.find(
    id => id.toString() !== userId.toString()
  );
};

// Update last message reference
conversationSchema.methods.updateLastMessage = function(messageId) {
  this.lastMessage = messageId;
  this.lastMessageAt = new Date();
  return this.save();
};

// Increment unread count for a user
conversationSchema.methods.incrementUnread = function(userId) {
  const unread = this.unreadCount.find(
    u => u.user.toString() === userId.toString()
  );
  
  if (unread) {
    unread.count += 1;
  } else {
    this.unreadCount.push({ user: userId, count: 1 });
  }
  
  return this.save();
};

// Reset unread count for a user
conversationSchema.methods.resetUnread = function(userId) {
  const unread = this.unreadCount.find(
    u => u.user.toString() === userId.toString()
  );
  
  if (unread) {
    unread.count = 0;
  }
  
  return this.save();
};

// Get unread count for a specific user
conversationSchema.methods.getUnreadCount = function(userId) {
  const unread = this.unreadCount.find(
    u => u.user.toString() === userId.toString()
  );
  return unread ? unread.count : 0;
};

// Archive conversation for a user
conversationSchema.methods.archiveForUser = function(userId, archive = true) {
  const archived = this.isArchived.find(
    a => a.user.toString() === userId.toString()
  );
  
  if (archived) {
    archived.archived = archive;
  } else {
    this.isArchived.push({ user: userId, archived: archive });
  }
  
  return this.save();
};

// Pin conversation for a user
conversationSchema.methods.pinForUser = function(userId, pin = true) {
  const pinned = this.isPinned.find(
    p => p.user.toString() === userId.toString()
  );
  
  if (pinned) {
    pinned.pinned = pin;
  } else {
    this.isPinned.push({ user: userId, pinned: pin });
  }
  
  return this.save();
};

// Check if conversation is archived for a user
conversationSchema.methods.isArchivedForUser = function(userId) {
  const archived = this.isArchived.find(
    a => a.user.toString() === userId.toString()
  );
  return archived ? archived.archived : false;
};

// Check if conversation is pinned for a user
conversationSchema.methods.isPinnedForUser = function(userId) {
  const pinned = this.isPinned.find(
    p => p.user.toString() === userId.toString()
  );
  return pinned ? pinned.pinned : false;
};

// Add/remove typing indicator
conversationSchema.methods.setTyping = function(userId, isTyping) {
  if (isTyping) {
    if (!this.typingUsers.includes(userId)) {
      this.typingUsers.push(userId);
    }
  } else {
    this.typingUsers = this.typingUsers.filter(
      id => id.toString() !== userId.toString()
    );
  }
  return this.save();
};

// Static method to find or create conversation between two users
conversationSchema.statics.findOrCreate = async function(user1Id, user2Id) {
  const participants = [user1Id, user2Id]
    .map(id => id.toString())
    .sort()
    .map(id => new mongoose.Types.ObjectId(id));

  try {
    const conversation = await this.findOneAndUpdate(
      { participants },
      { $setOnInsert: { participants } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    )
      .populate("participants", "name netId status profilePicture")
      .populate("lastMessage");

    return conversation;
  } catch (error) {
    if (error.code === 11000) {
      return this.findOne({ participants })
        .populate("participants", "name netId status profilePicture")
        .populate("lastMessage");
    }
    throw error;
  }
};

// Static method to get user's conversations
conversationSchema.statics.getUserConversations = function(userId, includeArchived = false) {
  const query = {
    participants: userId
  };
  
  return this.find(query)
    .populate("participants", "name netId status profilePicture lastSeen")
    .populate("lastMessage")
    .sort({ lastMessageAt: -1 })
    .then(conversations => {
      // Filter archived if needed and sort pinned first
      return conversations
        .filter(conv => includeArchived || !conv.isArchivedForUser(userId))
        .sort((a, b) => {
          const aPinned = a.isPinnedForUser(userId);
          const bPinned = b.isPinnedForUser(userId);
          if (aPinned && !bPinned) return -1;
          if (!aPinned && bPinned) return 1;
          return 0;
        });
    });
};

// Static method to get total unread count for a user
conversationSchema.statics.getTotalUnreadCount = async function(userId) {
  const conversations = await this.find({ participants: userId });
  
  return conversations.reduce((total, conv) => {
    return total + conv.getUnreadCount(userId);
  }, 0);
};

export default mongoose.model("Conversation", conversationSchema);
