import React, { useEffect, useState } from "react";
import { EncryptionService } from "./core/crypto/EncryptionService";
import { BinaryProtocol, BitchatPacket } from "./core/protocol/BinaryProtocol";
import { PacketType } from "./core/protocol/PacketTypes";
import { Buffer } from "buffer";

// Allow Buffer global for this component scope
(window as any).Buffer = Buffer;

function App() {
  const [logs, setLogs] = useState<string[]>([]);
  const [cryptoService] = useState(new EncryptionService());

  const addLog = (msg: string) => setLogs((prev) => [...prev, `> ${msg}`]);

  useEffect(() => {
    addLog("Initializing Zero State Kernel...");
    addLog(
      `Identity generated. Public Key: ${cryptoService.getPublicKey().substring(0, 16)}...`,
    );

    // Simulate a binary protocol test
    const testPayload = Buffer.from("Hello Zero State");
    const packet: BitchatPacket = {
      type: PacketType.TEXT_MESSAGE,
      packetId: 101,
      timestamp: Math.floor(Date.now() / 1000),
      ttl: 7,
      payload: testPayload,
    };

    addLog("Serializing Test Packet...");
    const binary = BinaryProtocol.serialize(packet);
    addLog(`Binary Size: ${binary.length} bytes`);
    addLog(`Hex: ${binary.toString("hex").substring(0, 40)}...`);

    const parsed = BinaryProtocol.deserialize(binary);
    addLog(`Deserialized: ${parsed.payload.toString()}`);
  }, []);

  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        color: "#00ff00",
        height: "100vh",
        fontFamily: "monospace",
        padding: "20px",
      }}
    >
      <h1>ZERO STATE // WEB</h1>
      <div
        style={{
          border: "1px solid #333",
          padding: "10px",
          height: "80vh",
          overflowY: "auto",
        }}
      >
        {logs.map((log, i) => (
          <div key={i}>{log}</div>
        ))}
      </div>
      <div style={{ marginTop: "10px", display: "flex", gap: "10px" }}>
        <input
          type="text"
          placeholder="Command entry..."
          style={{
            flex: 1,
            background: "#111",
            border: "1px solid #444",
            color: "#fff",
            padding: "10px",
          }}
        />
        <button
          style={{
            background: "#00ff00",
            color: "#000",
            border: "none",
            padding: "10px 20px",
            fontWeight: "bold",
          }}
        >
          EXEC
        </button>
      </div>
    </div>
  );
}

export default App;
