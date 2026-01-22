/**
 * Zero State / Bitchat Binary Protocol Constants
 * Maintains 100% compatibility with Android/iOS Packet types
 */
export enum PacketType {
  HEARTBEAT = 0x00,
  TEXT_MESSAGE = 0x01,
  IMAGE_MESSAGE = 0x02,
  AUDIO_MESSAGE = 0x03,
  FILE_MESSAGE = 0x04,
  IDENTITY_ANNOUNCEMENT = 0x10,
  ROUTING_INFO = 0x11,
  REQUEST_SYNC = 0x20,
  SYNC_DATA = 0x21,
  AUTH_CHALLENGE = 0x30,
  AUTH_RESPONSE = 0x31,
}

export const HEADER_SIZE = 13; // 1 byte type + 4 bytes ID + 4 bytes Timestamp + 4 bytes TTL/Hop
export const MAX_PACKET_SIZE = 512; // BLE MTU constraint, flexible on WebRTC but kept for parity
