import Scrypt from 'scrypt-kdf';

export async function hashPassword(password: string) {
  return (await Scrypt.kdf(password, { logN: 15, r: 8, p: 3 })).toString(
    'base64',
  );
}

export async function verifyPassword(password: string, storedHash: string) {
  return Scrypt.verify(Buffer.from(storedHash, 'base64'), password);
}
