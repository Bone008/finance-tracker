import { concatPayload, createEncryptionKey, createKnownEncryptionKey, decryptWithKey, deserializeEncryptionKey, encryptWithKey, PasswordMetadata, serializeEncryptionKey, splitPayload } from "./crypto-util";

describe('key serialization', () => {
  it('can serialize', async () => {
    const { key } = await createEncryptionKey('foobar passwd');

    const result = await serializeEncryptionKey(key);

    expect(() => JSON.parse(result)).not.toThrow();
    expect(result).toContain('"A128GCM"');
    expect(result).toContain('"encrypt"');
    expect(result).toContain('"decrypt"');
  });

  it('can deserialize', async () => {
    const jwt = '{"alg":"A128GCM","ext":true,"k":"fjh9F1yEpasZS_b0QQLTOA","key_ops":["encrypt","decrypt"],"kty":"oct"}';

    const result = await deserializeEncryptionKey(jwt);

    expect(result.algorithm.name).toBe('AES-GCM');
    expect(result.extractable).toBe(true);
  });
});

describe('payload structure', () => {
  it('is created', () => {
    const salt = new Uint8Array([...Array(32).keys()]).buffer;
    const iv = new Uint8Array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]).buffer;
    const ciphertext = new Uint8Array(100).fill(42).buffer;

    const payload = concatPayload({ meta: { salt, iterations: 255 }, iv, ciphertext });

    expect(new Uint8Array(payload)).toEqual(new Uint8Array([
      70, 84, 82, 65, 67, 75, // header
      1,
      // salt
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
      0, 0, 0, 255, // iterations
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, // iv
      ...Array(100).fill(42), // ciphertext
    ]));
  });

  it('is decomposed', () => {
    const payload = new Uint8Array([
      70, 84, 82, 65, 67, 75, // header
      1,
      // salt
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31,
      0, 0, 0, 255, // iterations
      100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111, // iv
      ...Array(100).fill(42), // ciphertext
    ]).buffer;

    const result = splitPayload(payload);

    expect(new Uint8Array(result.meta.salt)).toEqual(
      new Uint8Array([...Array(32).keys()]));
    expect(result.meta.iterations).toBe(255);
    expect(new Uint8Array(result.iv)).toEqual(
      new Uint8Array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]));
    expect(new Uint8Array(result.ciphertext)).toEqual(
      new Uint8Array(100).fill(42));
  });

  it('works end to end', () => {
    const salt = new Uint8Array([...Array(32).keys()]).buffer;
    const iv = new Uint8Array([100, 101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111]).buffer;
    const ciphertext = new Uint8Array(100).fill(42).buffer;

    const payload = concatPayload({ meta: { salt, iterations: 255 }, iv, ciphertext });
    const result = splitPayload(payload);

    expect(new Uint8Array(result.meta.salt)).toEqual(new Uint8Array(salt));
    expect(result.meta.iterations).toBe(255);
    expect(new Uint8Array(result.iv)).toEqual(new Uint8Array(iv));
    expect(new Uint8Array(result.ciphertext)).toEqual(new Uint8Array(ciphertext));
  });
});

describe('encrypt/decrypt', () => {
  it('works', async () => {
    const keyInfo = await createEncryptionKey('123456');
    const data = new TextEncoder().encode('secret text here').buffer;

    const payload = await encryptWithKey(data, keyInfo.key, keyInfo.meta);
    const result = await decryptWithKey(payload, keyInfo.key);

    expect(new Uint8Array(result)).toEqual(new Uint8Array(data));
  });

  it('works with known key', async () => {
    const meta: PasswordMetadata = {
      salt: new Uint8Array([...Array(32).keys()]).buffer,
      iterations: 255
    };
    const key = await createKnownEncryptionKey('123456', meta);
    const data = new TextEncoder().encode('secret text here').buffer;

    const payload = await encryptWithKey(data, key, meta);
    const result = await decryptWithKey(payload, key);

    expect(new Uint8Array(result)).toEqual(new Uint8Array(data));
  });
});
