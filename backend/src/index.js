import "dotenv/config";
import express from "express";
import cors from "cors"; //cross origin resource sharing
import mongoose from "mongoose";
import passport from "passport";
import http from "http";

import { initGoogleAuth } from "./auth/google.js";
import { attachSocketServer } from "./socket/index.js";

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));

//passport set up
app.use(passport.initialize());
initGoogleAuth(passport);

//Health check route
app.get("/health", (_, res) => res.json({ ok: true }));

//Auth routes
app.get("/auth/google", passport.authenticate("google", {scope: ["profile", "email"]}));

app.get("/auth/google/callback", passport.authenticate("google", { session: false, failureRedirect: `${process.env.CLIENT_URL}/login?error=oauth`}), 
(req, res) => { 
    const {token} = req.user;
    //Redirect to client with token
    res.redirect(`${process.env.CLIENT_URL}/login/success?token=${encodeURIComponent(token)}`);
}
);

//Connect to mongodb and start server
await mongoose.connect(process.env.MONGODB_URI);
console.log("Coonected to MONGODB");

const server = http.createServer(app);
attachSocketServer(server, app);

server.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on http://localhost:${process.env.PORT || 3000}`);
});