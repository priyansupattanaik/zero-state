import { openDB, deleteDB } from "idb";
import type { DBSchema, IDBPDatabase } from "idb";
import type { BitchatPacket } from "../protocol/BinaryProtocol";

interface ZeroStateDB extends DBSchema {
  identity: {
    key: string;
    value: string;
  };
  messages: {
    key: number;
    value: BitchatPacket & { direction: "in" | "out"; sender: string };
    indexes: { "by-timestamp": number };
  };
}

export class StorageService {
  private dbPromise: Promise<IDBPDatabase<ZeroStateDB>>;

  constructor() {
    this.dbPromise = openDB<ZeroStateDB>("zero-state-db", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("identity")) {
          db.createObjectStore("identity");
        }
        if (!db.objectStoreNames.contains("messages")) {
          const msgStore = db.createObjectStore("messages", {
            keyPath: "packetId",
          });
          msgStore.createIndex("by-timestamp", "timestamp");
        }
      },
    });
  }

  // --- Identity Management ---
  async saveIdentity(privateKeyHex: string) {
    const db = await this.dbPromise;
    await db.put("identity", privateKeyHex, "privateKey");
  }

  async loadIdentity(): Promise<string | undefined> {
    const db = await this.dbPromise;
    return await db.get("identity", "privateKey");
  }

  // --- Message History ---
  async saveMessage(
    packet: BitchatPacket,
    direction: "in" | "out",
    sender: string,
  ) {
    const db = await this.dbPromise;
    await db.put("messages", {
      ...packet,
      direction,
      sender,
    });
  }

  async getRecentMessages(limit: number = 50) {
    const db = await this.dbPromise;
    const tx = db.transaction("messages", "readonly");
    const index = tx.store.index("by-timestamp");

    let cursor = await index.openCursor(null, "prev");
    const messages = [];

    while (cursor && messages.length < limit) {
      messages.unshift(cursor.value);
      cursor = await cursor.continue();
    }

    return messages;
  }

  /**
   * Delete messages older than the specified seconds
   * Default: 24 hours (86400 seconds)
   */
  async pruneMessages(maxAgeSeconds: number = 86400) {
    const db = await this.dbPromise;
    const nowSec = Math.floor(Date.now() / 1000);
    const cutoff = nowSec - maxAgeSeconds;

    const tx = db.transaction("messages", "readwrite");
    const index = tx.store.index("by-timestamp");

    // Iterate over messages older than cutoff and delete them
    let cursor = await index.openCursor(IDBKeyRange.upperBound(cutoff));

    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }

    await tx.done;
    console.log(`[Storage] Pruned messages older than ${maxAgeSeconds}s`);
  }

  // --- NUKE PROTOCOL ---
  async nuke() {
    const db = await this.dbPromise;
    db.close();
    await deleteDB("zero-state-db");
  }
}
