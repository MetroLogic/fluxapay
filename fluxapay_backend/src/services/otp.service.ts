import bcrypt from 'bcrypt';
import { PrismaClient } from '../generated/client/client';
const prisma = new PrismaClient();

export async function createOtp(merchantId: string, channel: 'email' | 'phone') {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const hashedOtp = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min expiry

  // delete previous OTP for channel
  await prisma.oTP.deleteMany({ where: { merchantId, channel } });

  await prisma.oTP.create({
    data: { merchantId, channel, code: hashedOtp, expires_at: expiresAt },
  });

  return otp;
}

export async function verifyOtp(merchantId: string, channel: 'email' | 'phone', otp: string) {
  const otpRecord = await prisma.oTP.findUnique({ where: { merchantId_channel: { merchantId, channel } } });
  if (!otpRecord) return { success: false, message: 'OTP not found' };
  if (otpRecord.expires_at < new Date()) return { success: false, message: 'OTP expired' };

  const isValid = await bcrypt.compare(otp, otpRecord.code);
  if (!isValid) return { success: false, message: 'Invalid OTP' };

  // OTP is valid, delete it
  await prisma.oTP.delete({ where: { id: otpRecord.id } });
  return { success: true };
}
