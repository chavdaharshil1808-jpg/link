import nodemailer from "nodemailer";
import { config } from "../config";

const transporter = nodemailer.createTransport({
  host: config.SMTP_HOST,
  port: config.SMTP_PORT,
  secure: false,
  auth: {
    user: config.SMTP_USER,
    pass: config.SMTP_PASS,
  },
});

export async function sendMagicLinkEmail(to: string, magicLink: string): Promise<void> {
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: "Your Magic Link - Universal Downloader",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6C5CE7;">Sign in to Universal Downloader</h2>
        <p>Click the button below to sign in. This link expires in 15 minutes.</p>
        <a href="${magicLink}" style="
          display: inline-block;
          padding: 12px 32px;
          background: linear-gradient(135deg, #6C5CE7, #00E5FF);
          color: white;
          text-decoration: none;
          border-radius: 8px;
          font-weight: bold;
          margin: 16px 0;
        ">Sign In</a>
        <p style="color: #888; font-size: 12px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

export async function sendOtpEmail(to: string, otp: string): Promise<void> {
  await transporter.sendMail({
    from: config.SMTP_FROM,
    to,
    subject: "Your Verification Code - Universal Downloader",
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #6C5CE7;">Verification Code</h2>
        <p>Your verification code is:</p>
        <div style="
          font-size: 32px;
          font-weight: bold;
          letter-spacing: 8px;
          text-align: center;
          padding: 16px;
          background: #18181B;
          color: #00E5FF;
          border-radius: 8px;
          margin: 16px 0;
        ">${otp}</div>
        <p style="color: #888; font-size: 12px;">This code expires in 10 minutes.</p>
      </div>
    `,
  });
}
