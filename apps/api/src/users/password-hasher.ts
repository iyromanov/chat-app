import Scrypt from 'scrypt-kdf';

export async function hashPassword(password: string): Promise<string> {
  return (await Scrypt.kdf(password, { logN: 15, r: 8, p: 3 })).toString(
    'base64',
  );
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  return Scrypt.verify(Buffer.from(storedHash, 'base64'), password);
}
