import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).end();
    }

    const { token, password } = req.body;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const hashedPassword = await bcrypt.hash(password, 10);

        await updateUserPassword(decoded.email, hashedPassword); // Replace with actual DB update

        res.json({ message: "Password reset successful. Redirecting..." });
    } catch {
        res.status(400).json({ message: "Invalid or expired token." });
    }
}
