import nodemailer from "nodemailer";

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ message: "Method Not Allowed" });
    }

    const { name, email, message } = req.body;

    // Define your email credentials
    const transporter = nodemailer.createTransport({
        service: "Gmail", // or use SMTP config
        auth: {
            user: process.env.EMAIL_USER, // Set in .env.local
            pass: process.env.EMAIL_PASS, // Set in .env.local
        },
    });

    try {
        await transporter.sendMail({
            from: email,
            to: "kamiyo@kamio.ai", // Replace with your recipient email
            subject: `New Contact Form Submission from ${name}`,
            text: message,
        });

        return res.status(200).json({ message: "Email sent successfully!" });
    } catch (error) {
        console.error("Email sending failed:", error);
        return res.status(500).json({ message: "Email sending failed!" });
    }
}
