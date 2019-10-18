
const PBKDF2_ITERATIONS = 1000000;
const SALT_LENGTH_BYTES = 32;
const AES_ALGORITHM = 'AES-GCM';
const AES_IV_LENGTH_BYTES = 12;
const HEADER: readonly number[] = [70, 84, 82, 65, 67, 75]; // ASCII for "FTRACK"
const HEADER_VERSION = 1;

export interface PasswordMetadata {
  salt: ArrayBuffer;
  iterations: number;
}

interface StructuredPayload {
  meta: PasswordMetadata;
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
}

export async function serializeEncryptionKey(key: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', key);
  return JSON.stringify(jwk);
}

export async function deserializeEncryptionKey(serializedKey: string): Promise<CryptoKey> {
  const jwk: JsonWebKey = JSON.parse(serializedKey);
  const key = await window.crypto.subtle.importKey(
    'jwk', jwk, { name: AES_ALGORITHM, length: 128 }, true, ['encrypt', 'decrypt']);
  return key;
}


export async function createEncryptionKey(password: string): Promise<{ key: CryptoKey, meta: PasswordMetadata }> {
  const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES));
  return {
    key: await deriveEncryptionKey(password, salt, PBKDF2_ITERATIONS),
    meta: { salt, iterations: PBKDF2_ITERATIONS },
  };
}

export function createKnownEncryptionKey(password: string, meta: PasswordMetadata): Promise<CryptoKey> {
  return deriveEncryptionKey(password, meta.salt, meta.iterations);
}

export async function encryptWithKey(data: ArrayBuffer, key: CryptoKey, meta: PasswordMetadata): Promise<ArrayBuffer> {
  // Generates: iv
  const iv = window.crypto.getRandomValues(new Uint8Array(AES_IV_LENGTH_BYTES));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: AES_ALGORITHM, iv: iv }, key, data);

  // Returns: payload
  return concatPayload({ meta, iv: iv.buffer, ciphertext });
}

export async function decryptWithKey(payload: ArrayBuffer, key: CryptoKey): Promise<ArrayBuffer> {
  // Extracts from payload: iv, ciphertext
  const { iv, ciphertext } = splitPayload(payload);
  const data = await window.crypto.subtle.decrypt(
    { name: AES_ALGORITHM, iv: iv }, key, ciphertext);
  // Returns: data
  return data;
}

export function getPasswordInfoFromPayload(payload: ArrayBuffer): PasswordMetadata {
  return splitPayload(payload).meta;
}

export function isCryptoPayload(buffer: ArrayBuffer): boolean {
  const payloadHeader = new Uint8Array(buffer).slice(0, HEADER.length);
  return String.fromCharCode(...payloadHeader) === String.fromCharCode(...HEADER);
}

// Only exported for test.
export function concatPayload(payloadData: StructuredPayload): ArrayBuffer {
  console.assert(payloadData.meta.salt.byteLength === SALT_LENGTH_BYTES, 'invalid salt length');
  console.assert(payloadData.iv.byteLength === AES_IV_LENGTH_BYTES, 'invalid IV length');

  // Returns: payload = header + version + salt + iterations + iv + ciphertext
  const totalLength =
    HEADER.length + 1 + SALT_LENGTH_BYTES + 4
    + AES_IV_LENGTH_BYTES + payloadData.ciphertext.byteLength;
  const payload = new ArrayBuffer(totalLength);
  const bytes = new Uint8Array(payload);
  const view = new DataView(payload);
  let offset = 0;
  bytes.set(HEADER, 0);
  offset += HEADER.length;
  view.setUint8(offset, HEADER_VERSION);
  offset += 1;
  bytes.set(new Uint8Array(payloadData.meta.salt), offset);
  offset += SALT_LENGTH_BYTES;
  view.setUint32(offset, payloadData.meta.iterations);
  offset += 4;
  bytes.set(new Uint8Array(payloadData.iv), offset);
  offset += AES_IV_LENGTH_BYTES;
  bytes.set(new Uint8Array(payloadData.ciphertext), offset);

  return payload;
}

// Only exported for test.
export function splitPayload(payload: ArrayBuffer): StructuredPayload {
  const bytes = new Uint8Array(payload);
  const view = new DataView(payload);

  const payloadHeader = bytes.slice(0, HEADER.length);
  if (String.fromCharCode(...payloadHeader) !== String.fromCharCode(...HEADER)) {
    throw new Error('not a valid payload: header mismatch: ' + payloadHeader.join(','));
  }

  let offset = HEADER.length;
  view.getUint8(offset); // Unused: version.
  offset += 1;
  const salt = bytes.slice(offset, offset + SALT_LENGTH_BYTES).buffer;
  offset += SALT_LENGTH_BYTES;
  const iterations = view.getUint32(offset);
  offset += 4;
  const iv = bytes.slice(offset, offset + AES_IV_LENGTH_BYTES).buffer;
  offset += AES_IV_LENGTH_BYTES;
  const ciphertext = bytes.slice(offset).buffer;

  return {
    meta: { salt, iterations },
    iv, ciphertext,
  }
}

async function deriveEncryptionKey(password: string, salt: ArrayBuffer, iterations: number): Promise<CryptoKey> {
  const rawKey = await window.crypto.subtle.importKey(
    'raw', encodeString(password), 'PBKDF2', false, ['deriveKey']);

  return await window.crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    rawKey,
    { name: AES_ALGORITHM, length: 128 },
    true,
    ['encrypt', 'decrypt']
  );
}

function encodeString(input: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(input);
}
