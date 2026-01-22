import { SimplePool, finalizeEvent, getPublicKey } from "nostr-tools";
import type { Event as NostrEvent, EventTemplate, Filter } from "nostr-tools";
import { EventEmitter } from "events";
import { Buffer } from "buffer";

const ZERO_STATE_KIND = 30078;
const RELAYS = ["wss://relay.damus.io", "wss://relay.primal.net"];

export class NostrSignaling extends EventEmitter {
  private pool: SimplePool;
  private publicKey: string;
  private privateKey: Uint8Array;

  constructor(privKeyHex: string) {
    super();
    this.pool = new SimplePool();

    // nostr-tools v2 requires Uint8Array for keys
    this.privateKey = Buffer.from(privKeyHex, "hex");
    this.publicKey = getPublicKey(this.privateKey);
  }

  async connect() {
    const filter: Filter = {
      kinds: [ZERO_STATE_KIND],
      "#t": ["zero-state-presence"],
      limit: 10,
    };

    // v2 uses subscribeMany with a callback object
    // cast [filter] to any to bypass strict type mismatch in some library versions
    this.pool.subscribeMany(RELAYS, [filter] as any, {
      onevent: (event: NostrEvent) => {
        // Ignore our own events
        if (event.pubkey !== this.publicKey) {
          this.emit("peer-discovered", event);
        }
      },
    });

    console.log("Connected to Nostr Relays");
  }

  async announcePresence(signalData: any) {
    const eventTemplate: EventTemplate = {
      kind: ZERO_STATE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [["t", "zero-state-presence"]],
      content: JSON.stringify(signalData),
    };

    // v2 signing method
    const signedEvent = finalizeEvent(eventTemplate, this.privateKey);

    // Publish returns a Promise array, we wait for any success
    await Promise.any(this.pool.publish(RELAYS, signedEvent));
    console.log("Presence announced on Nostr");
  }
}
