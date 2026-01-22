import {
  SimplePool,
  getEventHash,
  getSignature,
  Event as NostrEvent,
} from "nostr-tools";
import { EventEmitter } from "events";

// Bitchat uses specific topics; we will use a dedicated Nostr "Kind" for signaling
// Using Kind 30078 (Application Specific Data) for this example
const ZERO_STATE_KIND = 30078;
const RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net"];

export class NostrSignaling extends EventEmitter {
  private pool: SimplePool;
  private publicKey: string;
  private privateKey: string; // In a real app, manage this securely!

  constructor(pubKey: string, privKey: string) {
    super();
    this.publicKey = pubKey;
    this.privateKey = privKey;
    this.pool = new SimplePool();
  }

  async connect() {
    // Subscribe to finding other Zero State peers
    const sub = this.pool.sub(RELAYS, [
      {
        kinds: [ZERO_STATE_KIND],
        "#t": ["zero-state-presence"], // Tag to filter our traffic
        limit: 10,
      },
    ]);

    sub.on("event", (event: NostrEvent) => {
      if (event.pubkey !== this.publicKey) {
        this.emit("peer-discovered", event);
      }
    });

    console.log("Connected to Nostr Relays");
  }

  async announcePresence(signalData: any) {
    const event = {
      kind: ZERO_STATE_KIND,
      pubkey: this.publicKey,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", "zero-state-presence"]],
      content: JSON.stringify(signalData),
    };

    // Note: In older nostr-tools, signing is manual.
    // Ensure you match the version you installed.
    // This assumes nostr-tools v1.x API for simplicity.
    // For v2+, the API differs slightly.
    (event as any).id = getEventHash(event as any);
    (event as any).sig = getSignature(event as any, this.privateKey);

    await this.pool.publish(RELAYS, event as any);
    console.log("Presence announced on Nostr");
  }
}
