import nacl from "tweetnacl";
import { Buffer } from "buffer";

export class EncryptionService {
  private keyPair: nacl.BoxKeyPair;

  constructor() {
    this.keyPair = nacl.box.keyPair();
  }

  getPublicKey(): string {
    return Buffer.from(this.keyPair.publicKey).toString("hex");
  }

  async encryptAES(
    message: string,
    sharedSecret: Uint8Array,
  ): Promise<{ iv: Uint8Array; cipherText: Uint8Array }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encodedMsg = new TextEncoder().encode(message);

    // Change: Added explicit cast (sharedSecret as any) to bypass strict BufferSource check
    const key = await crypto.subtle.importKey(
      "raw",
      sharedSecret as any,
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
