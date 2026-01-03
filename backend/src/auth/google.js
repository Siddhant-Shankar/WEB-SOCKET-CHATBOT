import {Strategy as GoogleStrategy} from 'passport-google-oauth20';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export function initGoogleAuth(passport) {
    passport.use(new GoogleStrategy({ 
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
    }, 
    async (_accessToken, _refreshToken, profile, done) => { 
        try { 
            //Ensure email is from illinois.edu domain
            const email = profile.emails[0].value?.toLowerCase();
            if (!email || !email.endsWith("@illinois.edu")) {
                return done(null, false, {message : "Invalid email domain"});
            }
            const netId = email.split("@")[0];
            //Upsert a user in the mongodb
            const user = await User.findOneAndUpdate(
                {email}, 
                {email, netId, name: profile.displayName}, 
                {upsert: true, new: true}
            );

            //Create JWT Token
            const token = jwt.sign(
                {id: user._id.toString(), email: user.email}, 
                process.env.JWT_SECRET, { expiresIn: '24h'}
            );
            done(null, {token});
        } catch (err) { 
            done(err);
        }
    }
));   
}