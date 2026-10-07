import { jwtVerify, SignJWT } from "jose";
import bcrypt from "bcryptjs";

export const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET || "default_super_secret_key_that_should_be_changed";
  return new TextEncoder().encode(secret);
};

export async function verifyJwtToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey());
    return payload;
  } catch (error) {
    return null;
  }
}

export async function signJwtToken(payload: any) {
  const secret = getJwtSecretKey();
  const alg = "HS256";
  return new SignJWT(payload)
    .setProtectedHeader({ alg })
    .setIssuedAt()
    .setExpirationTime("24h") // 1 day
    .sign(secret);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    // Önce bcrypt hash ile doğrulamayı dene
    const isMatch = await bcrypt.compare(password, hash);
    if (isMatch) return true;
    // Düz metin geçiş kontrolü (varsa)
    return password === hash;
  } catch {
    return password === hash;
  }
}
