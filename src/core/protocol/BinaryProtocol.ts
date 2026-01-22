import { Buffer } from "buffer";
import { PacketType, HEADER_SIZE } from "./PacketTypes";
import { v4 as uuidv4 } from "uuid";

export interface BitchatPacket {
  type: PacketType;
  packetId: number; // 4 bytes
  timestamp: number; // 4 bytes (Unix epoch seconds)
  ttl: number; // 4 bytes (Routing info)
  payload: Buffer;
}

export class BinaryProtocol {
  /**
   * Serializes a packet into a binary buffer compatible with Bitchat Android/iOS
   */
  static serialize(packet: BitchatPacket): Buffer {
    const buffer = Buffer.alloc(HEADER_SIZE + packet.payload.length);

    // 1. Type (1 byte)
    buffer.writeUInt8(packet.type, 0);

    // 2. Packet ID (4 bytes) - simplistic mapping for demo, usually specific ID logic
    buffer.writeUInt32BE(packet.packetId, 1);

    // 3. Timestamp (4 bytes)
    buffer.writeUInt32BE(packet.timestamp, 5);

    // 4. TTL / Routing (4 bytes)
    buffer.writeUInt32BE(packet.ttl, 9);

    // 5. Payload
    packet.payload.copy(buffer, HEADER_SIZE);

    return buffer;
  }

  /**
   * Parses a raw binary buffer from the network (WebRTC/Nostr)
   */
  static deserialize(buffer: Buffer): BitchatPacket {
    if (buffer.length < HEADER_SIZE) {
      throw new Error(`Packet too short: ${buffer.length} < ${HEADER_SIZE}`);
    }

    const type = buffer.readUInt8(0);
    const packetId = buffer.readUInt32BE(1);
    const timestamp = buffer.readUInt32BE(5);
    const ttl = buffer.readUInt32BE(9);
    const payload = buffer.slice(HEADER_SIZE);

    return {
      type: type as PacketType,
      packetId,
      timestamp,
      ttl,
      payload,
    };
  }
}
