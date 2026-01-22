/**
 * Zero State / Bitchat Binary Protocol Constants
 * Maintains 100% compatibility with Android/iOS Packet types
 */
// Change: Converted enum to const object
export const PacketType = {
  HEARTBEAT: 0x00,
  TEXT_MESSAGE: 0x01,
  IMAGE_MESSAGE: 0x02,
  AUDIO_MESSAGE: 0x03,
  FILE_MESSAGE: 0x04,
  IDENTITY_ANNOUNCEMENT: 0x10,
  ROUTING_INFO: 0x11,
  REQUEST_SYNC: 0x20,
  SYNC_DATA: 0x21,
  AUTH_CHALLENGE: 0x30,
  AUTH_RESPONSE: 0x31,
} as const;

// Create a type alias so we can still use PacketType as a type
export type PacketType = (typeof PacketType)[keyof typeof PacketType];

export const HEADER_SIZE = 13;
export const MAX_PACKET_SIZE = 512;
