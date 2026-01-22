import jwt, { SignOptions } from "jsonwebtoken";

export const generateToken = (merchantId: string, email: string) => {
  const options: SignOptions = {
    expiresIn: parseInt(process.env.JWT_EXPIRES_IN || "2592000", 10), //2592000 in .env i.e 30 days
  };
  const t = jwt.sign(
    { id: merchantId, email },
    process.env.JWT_SECRET!,
    options,
  );
  return { token: t };
};
