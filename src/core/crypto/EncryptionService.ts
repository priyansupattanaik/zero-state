import nacl from "tweetnacl";
import util from "tweetnacl-util";
import { Buffer } from "buffer";

export class EncryptionService {
  private keyPair: nacl.BoxKeyPair;

  constructor(existingPrivateKeyHex?: string) {
    if (existingPrivateKeyHex) {
      const secretKey = new Uint8Array(
        Buffer.from(existingPrivateKeyHex, "hex"),
      );
      this.keyPair = nacl.box.keyPair.fromSecretKey(secretKey);
    } else {
      this.keyPair = nacl.box.keyPair();
    }
  }

  getPublicKey(): string {
    return Buffer.from(this.keyPair.publicKey).toString("hex");
  }

  getPrivateKey(): string {
    return Buffer.from(this.keyPair.secretKey).toString("hex");
  }

  /**
   * Encrypts a binary payload specifically for a receiver's Public Key.
   * Returns: Nonce (24 bytes) + Ciphertext
   */
  boxEncrypt(data: Uint8Array, receiverPublicKeyHex: string): string {
    const receiverKey = new Uint8Array(
      Buffer.from(receiverPublicKeyHex, "hex"),
    );
    const nonce = nacl.randomBytes(nacl.box.nonceLength);

    const encrypted = nacl.box(
      data,
      nonce,
      receiverKey,
      this.keyPair.secretKey,
    );

    // Combine Nonce + Ciphertext
    const fullMessage = new Uint8Array(nonce.length + encrypted.length);
    fullMessage.set(nonce);
    fullMessage.set(encrypted, nonce.length);

    return util.encodeBase64(fullMessage);
  }

  /**
   * Decrypts a payload coming from a specific sender.
   */
  boxDecrypt(
    base64Data: string,
    senderPublicKeyHex: string,
  ): Uint8Array | null {
    try {
      const messageWithNonce = util.decodeBase64(base64Data);
      const senderKey = new Uint8Array(Buffer.from(senderPublicKeyHex, "hex"));

      const nonce = messageWithNonce.slice(0, nacl.box.nonceLength);
      const cipherText = messageWithNonce.slice(nacl.box.nonceLength);

      const decrypted = nacl.box.open(
        cipherText,
        nonce,
        senderKey,
        this.keyPair.secretKey,
      );

      return decrypted; // Returns null if decryption fails
    } catch (e) {
      console.error("Decryption failed:", e);
      return null;
    }
  }
}
