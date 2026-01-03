import jwt from 'jsonwebtoken';

export function authenticateJWT(req, res, next) {
    const header = req.headers.authorization?.split(' ')[1];
    if (!header) { 
        return res.status(401).json({message: "Unauthorized/Missing valid login credentials"});
    }
    try {
        const decoded = jwt.verify(header, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}