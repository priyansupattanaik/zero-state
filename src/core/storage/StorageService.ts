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

  // --- NUKE PROTOCOL (Fix for locking issue) ---
  async nuke() {
    const db = await this.dbPromise;
    db.close(); // IMPORTANT: Close connection first
    await deleteDB("zero-state-db"); // Now delete safely
  }
}
