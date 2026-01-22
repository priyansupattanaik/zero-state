import { SimplePool, finalizeEvent, getPublicKey } from "nostr-tools";
import type { Event as NostrEvent, EventTemplate, Filter } from "nostr-tools";
import { EventEmitter } from "events";
import { Buffer } from "buffer";

const ZERO_STATE_KIND = 1;

const RELAYS = [
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

export class NostrSignaling extends EventEmitter {
  private pool: SimplePool;
  public publicKey: string;
  public encryptionKey: string;
  private privateKey: Uint8Array;

  // NEW: Track current topic so we send messages to the right room
  private currentTopic: string = "zero-state-v1-global";

  constructor(privKeyHex: string, encryptionPubKeyHex: string) {
    super();
    this.pool = new SimplePool();
    this.privateKey = Buffer.from(privKeyHex, "hex");
    this.publicKey = getPublicKey(this.privateKey);
    this.encryptionKey = encryptionPubKeyHex;
  }

  /**
   * Connects (or Switches) to a specific Mesh Topic/Geohash
   */
  async connect(topic: string = "zero-state-v1-global") {
    this.currentTopic = topic;

    // Unsubscribe logic would go here in a full framework,
    // for now we just add a new filter which works for simple use cases.

    const filter: Filter = {
      kinds: [ZERO_STATE_KIND],
      "#t": [this.currentTopic], // Listen ONLY to this location/topic
      limit: 30,
    };

    // Note: In a real app, you'd close the old subscription here.
    this.pool.subscribeMany(RELAYS, filter, {
      onevent: (event: NostrEvent) => {
        this.emit("network-event", event);
      },
    });
    console.log(`Switched Frequency to: ${this.currentTopic}`);
  }

  async publishPacket(base64Payload: string) {
    const content = JSON.stringify({
      t: "pkt",
      d: base64Payload,
      k: this.encryptionKey,
    });
    await this.publishToMesh(content);
  }

  async publishPrivatePacket(
    encryptedBase64: string,
    receiverNostrPubKey: string,
  ) {
    const content = JSON.stringify({
      t: "enc",
      d: encryptedBase64,
      k: this.encryptionKey,
    });
    // We still route private messages via the CURRENT topic (location)
    // This simulates "You must be in the same area to talk"
    await this.publishToMesh(content, [["p", receiverNostrPubKey]]);
  }

  async announcePresence(signalData: any) {
    const content = JSON.stringify({
      t: "sig",
      d: signalData,
      k: this.encryptionKey,
    });
    await this.publishToMesh(content);
  }

  private async publishToMesh(content: string, extraTags: string[][] = []) {
    // IMPORTANT: We tag the event with the CURRENT TOPIC (Geohash)
    const tags = [["t", this.currentTopic], ...extraTags];

    const eventTemplate: EventTemplate = {
      kind: ZERO_STATE_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: tags,
      content: content,
    };

    const signedEvent = finalizeEvent(eventTemplate, this.privateKey);

    try {
      await Promise.any(this.pool.publish(RELAYS, signedEvent));
    } catch (error: any) {
      console.error("Publish Error:", error);
    }
  }
}
