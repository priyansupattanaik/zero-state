import nacl from "tweetnacl";
import { Buffer } from "buffer";

export class EncryptionService {
  private keyPair: nacl.BoxKeyPair;

  constructor() {
    // Generate ephemeral keys on startup (Forward Secrecy principle)
    this.keyPair = nacl.box.keyPair();
  }

  getPublicKey(): string {
    return Buffer.from(this.keyPair.publicKey).toString("hex");
  }

  /**
   * Encrypts a message for a specific peer using X25519 + XSalsa20-Poly1305 (TweetNaCl default)
   * Note: Bitchat Android uses AES-GCM.
   * To maintain strict compatibility with Bitchat Android (AES-GCM),
   * we would typically use WebCrypto API (SubtleCrypto).
   * * Below is the WebCrypto AES-GCM implementation plan for strict parity.
   */
  async encryptAES(
    message: string,
    sharedSecret: Uint8Array,
  ): Promise<{ iv: Uint8Array; cipherText: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 12 bytes for GCM
    const encodedMsg = new TextEncoder().encode(message);

    const key = await crypto.subtle.importKey(
      "raw",
      sharedSecret,
      { name: "AES-GCM" },
      false,
      ["encrypt"],
    );

    const cipherTextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encodedMsg,
    );

    return {
      iv: iv,
      cipherText: new Uint8Array(cipherTextBuffer),
    };
  }
}
