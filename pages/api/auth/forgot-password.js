import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";

export default async function handler(req, res) {
    if (req.method !== "POST") return res.status(405).end();

    const { email } = req.body;
    const user = await getUserByEmail(email); // Replace with actual DB lookup

    if (!user) return res.status(400).json({ message: "Email not found." });

    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: "1h" });

    const resetLink = `${process.env.NEXTAUTH_URL}/auth/reset-password?token=${token}`;

    const transporter = nodemailer.createTransport({
        service: "Gmail",
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    await transporter.sendMail({
        from: '"Kamiyo AI" <no-reply@kamiyo.ai>',
        to: email,
        subject: "Password Reset",
        html: `<p>Click <a href="${resetLink}">here</a> to reset your password.</p>`,
    });

    res.json({ message: "Reset link sent to email." });
}
