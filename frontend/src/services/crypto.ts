/**
 * MoneyCouncil Web Crypto Utilities.
 * Handles client-side PIN hashing using PBKDF2-HMAC-SHA256
 * and optional AES-GCM 256-bit encryption for offline cached data.
 */

function arrayBufferToHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

export function generateSaltHex(): string {
  const salt = new Uint8Array(16);
  window.crypto.getRandomValues(salt);
  return arrayBufferToHex(salt.buffer);
}

/**
 * Derives a cryptographic hash from a user PIN using PBKDF2 with 100,000 iterations.
 */
export async function hashPin(
  pin: string,
  existingSaltHex?: string
): Promise<{ hashHex: string; saltHex: string }> {
  const saltHex = existingSaltHex || generateSaltHex();
  const saltBytes = new Uint8Array(hexToArrayBuffer(saltHex));
  const enc = new TextEncoder();
  const pinBytes = enc.encode(pin);

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    pinBytes,
    { name: "PBKDF2" },
    false,
    ["deriveBits"]
  );

  const derivedBits = await window.crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256
  );

  return {
    hashHex: arrayBufferToHex(derivedBits),
    saltHex,
  };
}

/**
 * Verifies a PIN against a stored salted PBKDF2 hash.
 */
export async function verifyPin(
  pin: string,
  storedHashHex: string,
  saltHex: string
): Promise<boolean> {
  const { hashHex } = await hashPin(pin, saltHex);
  return hashHex === storedHashHex;
}

/**
 * Encrypts arbitrary data using AES-GCM with a key derived from the user's PIN.
 */
export async function encryptData(data: any, pin: string, saltHex: string): Promise<string> {
  const saltBytes = new Uint8Array(hexToArrayBuffer(saltHex));
  const enc = new TextEncoder();
  const pinBytes = enc.encode(pin);

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    pinBytes,
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );

  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);

  const jsonStr = JSON.stringify(data);
  const dataBytes = enc.encode(jsonStr);

  const cipherBuffer = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    dataBytes
  );

  const ivHex = arrayBufferToHex(iv.buffer);
  const cipherHex = arrayBufferToHex(cipherBuffer);

  return `${ivHex}:${cipherHex}`;
}

/**
 * Decrypts AES-GCM encrypted data using a key derived from the user's PIN.
 */
export async function decryptData(
  encryptedStr: string,
  pin: string,
  saltHex: string
): Promise<any> {
  const [ivHex, cipherHex] = encryptedStr.split(":");
  if (!ivHex || !cipherHex) throw new Error("Malformed encrypted payload.");

  const saltBytes = new Uint8Array(hexToArrayBuffer(saltHex));
  const ivBytes = new Uint8Array(hexToArrayBuffer(ivHex));
  const cipherBytes = new Uint8Array(hexToArrayBuffer(cipherHex));
  const enc = new TextEncoder();

  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  const aesKey = await window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  );

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    aesKey,
    cipherBytes
  );

  const dec = new TextDecoder();
  const jsonStr = dec.decode(decryptedBuffer);
  return JSON.parse(jsonStr);
}
