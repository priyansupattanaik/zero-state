import { Buffer } from "buffer";
import { PacketType, HEADER_SIZE } from "./PacketTypes";
// Change: Removed unused uuid import

export interface BitchatPacket {
  type: PacketType;
  packetId: number;
  timestamp: number;
  ttl: number;
  payload: Buffer;
}

export class BinaryProtocol {
  static serialize(packet: BitchatPacket): Buffer {
    const buffer = Buffer.alloc(HEADER_SIZE + packet.payload.length);

    // Change: Added explicit number cast for type safety with the new const PacketType
    buffer.writeUInt8(packet.type as number, 0);

    buffer.writeUInt32BE(packet.packetId, 1);
    buffer.writeUInt32BE(packet.timestamp, 5);
    buffer.writeUInt32BE(packet.ttl, 9);
    packet.payload.copy(buffer, HEADER_SIZE);

    return buffer;
  }

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
