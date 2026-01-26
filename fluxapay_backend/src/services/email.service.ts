import dotenv from "dotenv";
import { Resend } from "resend";
import { isDevEnv } from "../helpers/env.helper";
dotenv.config();

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const resend = new Resend(RESEND_API_KEY);

export async function sendOtpEmail(to: string, otp: string) {
  try {
    const response = await resend.emails.send({
      from: process.env.MAIL_FROM || "noreply@fluxapay.com",
      to,
      subject: "Your Fluxapay OTP",
      html: `<p>Your OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    });
    if (response.error) {
      if (isDevEnv()) {
        console.error("Error sending OTP:", response.error);
      }
      throw new Error("Failed to send OTP email");
    }
  } catch (err) {
    if (isDevEnv()) {
      console.error("Error sending OTP:", err);
    }
    throw err;
  }
}
