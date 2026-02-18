import { SignJWT, jwtVerify } from 'jose';

export interface AuthPayload {
  studentId: string;
  studentCode: string;
  studentName: string;
}

const JWT_SECRET = process.env.JWT_SECRET;

function getSecretKey(): Uint8Array {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET must be set');
  }
  return new TextEncoder().encode(JWT_SECRET);
}

export async function signToken(payload: AuthPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getSecretKey());
}

export async function verifyToken(token: string): Promise<AuthPayload> {
  const { payload } = await jwtVerify(token, getSecretKey());
  return {
    studentId: payload.studentId as string,
    studentCode: payload.studentCode as string,
    studentName: payload.studentName as string,
  };
}
