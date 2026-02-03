import { Server } from "socket.io";
import mongoose from "mongoose";
import { verifyToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import Room from "../models/Room.js";

export function attachSocketServer(server, app) {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      credentials: true
    }
  });
  const rateLimitStore = new Map();

  const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);
  const getLimiterKey = (userId, action) => `${userId}:${action}`;
  const enforceRateLimit = (userId, action, limit, windowMs) => {
    const key = getLimiterKey(userId, action);
    const now = Date.now();
    const bucket = rateLimitStore.get(key) || { windowStart: now, count: 0 };

    if (now - bucket.windowStart >= windowMs) {
      bucket.windowStart = now;
      bucket.count = 0;
    }

    bucket.count += 1;
    rateLimitStore.set(key, bucket);

    return bucket.count <= limit;
  };
  const requireString = (value) => typeof value === "string" && value.trim().length > 0;

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error("No token"));

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error("User not found"));

      socket.userId = user._id.toString();
      socket.userName = user.name;
      next();
    } catch (err) {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", async (socket) => {
    const userId = socket.userId;
    console.log(`${socket.userName} connected`);

    // Set user online
    await User.findByIdAndUpdate(userId, { status: "online", lastSeen: new Date() });
    socket.broadcast.emit("user:online", { userId, userName: socket.userName });

    // Join user's personal room
    socket.join(`user:${userId}`);

    // ===== CONVERSATION EVENTS =====
    
    // Start/get a conversation
    socket.on("conversation:start", async ({ otherUserId }, callback) => {
      try {
        if (!isValidObjectId(otherUserId)) {
          return callback({ error: "Invalid user" });
        }
        if (otherUserId === userId) {
          return callback({ error: "Cannot start a conversation with yourself" });
        }
        if (!enforceRateLimit(userId, "conversation:start", 6, 10_000)) {
          return callback({ error: "Too many requests" });
        }

        const conversation = await Conversation.findOrCreate(userId, otherUserId);
        const messages = await Message.find({ conversation: conversation._id })
          .sort({ createdAt: 1 })
          .limit(50)
          .populate("sender", "name netId");
        
        socket.join(`conversation:${conversation._id}`);
        callback({ success: true, conversation, messages });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // Send message in conversation
    socket.on("message:send:conversation", async ({ conversationId, content }, callback) => {
      try {
        if (!isValidObjectId(conversationId)) {
          return callback({ error: "Invalid conversation" });
        }
        if (!requireString(content)) {
          return callback({ error: "Message content is required" });
        }
        if (!enforceRateLimit(userId, "message:send:conversation", 20, 10_000)) {
          return callback({ error: "Too many messages" });
        }

        const conversation = await Conversation.findById(conversationId);
        if (!conversation) {
          return callback({ error: "Conversation not found" });
        }
        if (!conversation.participants.includes(userId)) {
          return callback({ error: "Not authorized" });
        }

        const message = await Message.create({
          sender: userId,
          conversation: conversationId,
          room: null,
          content,
          messageType: "text"
        });
        
        await message.populate("sender", "name netId");
        await conversation.updateLastMessage(message._id);

        // Send to both users
        io.to(`conversation:${conversationId}`).emit("message:new", { message });
        
        callback({ success: true, message });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // ===== ROOM EVENTS =====
    
    // Create a room
    socket.on("room:create", async ({ name, description, isPrivate }, callback) => {
      try {
        if (!requireString(name)) {
          return callback({ error: "Room name is required" });
        }
        if (!enforceRateLimit(userId, "room:create", 3, 60_000)) {
          return callback({ error: "Too many room creations" });
        }

        const room = await Room.create({
          name: name.trim(),
          description: typeof description === "string" ? description.trim() : description,
          isPrivate: isPrivate || false,
          createdBy: userId,
          members: [{ user: userId, role: "owner" }]
        });

        socket.join(`room:${room._id}`);
        callback({ success: true, room });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // Join a room
    socket.on("room:join", async ({ roomId }, callback) => {
      try {
        if (!isValidObjectId(roomId)) {
          return callback({ error: "Invalid room" });
        }
        if (!enforceRateLimit(userId, "room:join", 12, 10_000)) {
          return callback({ error: "Too many requests" });
        }

        const room = await Room.findById(roomId).populate("members.user", "name netId");
        if (!room || !room.isMember(userId)) {
          return callback({ error: "Not authorized" });
        }

        socket.join(`room:${roomId}`);
        
        const messages = await Message.find({ room: roomId })
          .sort({ createdAt: 1 })
          .limit(50)
          .populate("sender", "name netId");

        callback({ success: true, room, messages });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // Send message in room
    socket.on("message:send:room", async ({ roomId, content }, callback) => {
      try {
        if (!isValidObjectId(roomId)) {
          return callback({ error: "Invalid room" });
        }
        if (!requireString(content)) {
          return callback({ error: "Message content is required" });
        }
        if (!enforceRateLimit(userId, "message:send:room", 20, 10_000)) {
          return callback({ error: "Too many messages" });
        }

        const room = await Room.findById(roomId);
        if (!room || !room.isMember(userId)) {
          return callback({ error: "Not authorized" });
        }

        const message = await Message.create({
          sender: userId,
          room: roomId,
          conversation: null,
          content,
          messageType: "text"
        });
        
        await message.populate("sender", "name netId");
        await room.updateActivity();

        io.to(`room:${roomId}`).emit("message:new", { message });
        
        callback({ success: true, message });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // Get user's conversations
    socket.on("conversation:list", async (callback) => {
      try {
        const conversations = await Conversation.find({ participants: userId })
          .populate("participants", "name netId status")
          .populate("lastMessage")
          .sort({ lastMessageAt: -1 });

        callback({ success: true, conversations });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // Get user's rooms
    socket.on("room:list", async (callback) => {
      try {
        const rooms = await Room.find({ "members.user": userId, isActive: true })
          .populate("createdBy", "name netId")
          .sort({ lastActivity: -1 });

        callback({ success: true, rooms });
      } catch (error) {
        callback({ error: error.message });
      }
    });

    // ===== TYPING INDICATOR =====
    
    socket.on("typing:start", ({ conversationId, roomId }) => {
      if (!enforceRateLimit(userId, "typing:start", 15, 5_000)) {
        return;
      }
      if (conversationId && isValidObjectId(conversationId)) {
        Conversation.findById(conversationId)
          .then(conversation => {
            if (conversation && conversation.participants.includes(userId)) {
              socket.to(`conversation:${conversationId}`).emit("typing:start", { userId, userName: socket.userName });
            }
          })
          .catch(() => {});
      } else if (roomId && isValidObjectId(roomId)) {
        Room.findById(roomId)
          .then(room => {
            if (room && room.isMember(userId)) {
              socket.to(`room:${roomId}`).emit("typing:start", { userId, userName: socket.userName });
            }
          })
          .catch(() => {});
      }
    });

    socket.on("typing:stop", ({ conversationId, roomId }) => {
      if (!enforceRateLimit(userId, "typing:stop", 15, 5_000)) {
        return;
      }
      if (conversationId && isValidObjectId(conversationId)) {
        Conversation.findById(conversationId)
          .then(conversation => {
            if (conversation && conversation.participants.includes(userId)) {
              socket.to(`conversation:${conversationId}`).emit("typing:stop", { userId });
            }
          })
          .catch(() => {});
      } else if (roomId && isValidObjectId(roomId)) {
        Room.findById(roomId)
          .then(room => {
            if (room && room.isMember(userId)) {
              socket.to(`room:${roomId}`).emit("typing:stop", { userId });
            }
          })
          .catch(() => {});
      }
    });

    // ===== DISCONNECT =====
    
    socket.on("disconnect", async () => {
      console.log(`${socket.userName} disconnected`);
      await User.findByIdAndUpdate(userId, { status: "offline", lastSeen: new Date() });
      socket.broadcast.emit("user:offline", { userId });
    });
  });

  app.set("io", io);
  console.log("Socket.IO server attached");
  return io;
}
