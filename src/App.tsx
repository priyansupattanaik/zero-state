import { useEffect, useState, useRef } from "react";
import { EncryptionService } from "./core/crypto/EncryptionService";
import { StorageService } from "./core/storage/StorageService";
import { BinaryProtocol } from "./core/protocol/BinaryProtocol";
import type { BitchatPacket } from "./core/protocol/BinaryProtocol";
import { PacketType } from "./core/protocol/PacketTypes";
import { Buffer } from "buffer";
import { NostrSignaling } from "./core/network/NostrSignaling";
import { ImageUtils } from "./core/media/ImageUtils";
import { AudioRecorder } from "./core/media/AudioRecorder";
import { GeohashUtils } from "./core/geo/GeohashUtils";

(window as any).Buffer = Buffer;

interface LogEntry {
  id: string;
  timestamp: number;
  sender: string;
  receiver?: string;
  content: string;
  contentType: "text" | "image" | "audio";
  type: "system" | "public" | "secret" | "self";
}

function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isReady, setIsReady] = useState(false);
  const [myPubKey, setMyPubKey] = useState<string>("");
  const [secureModeUser, setSecureModeUser] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [currentHash, setCurrentHash] = useState<string>("GLOBAL");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const nostrRef = useRef<NostrSignaling | null>(null);
  const storageRef = useRef<StorageService>(new StorageService());
  const cryptoRef = useRef<EncryptionService | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const peerMap = useRef<{ [curveKey: string]: string }>({});
  const audioRecorderRef = useRef<AudioRecorder>(new AudioRecorder());

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [logs]);

  const addSystemLog = (msg: string) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        sender: "SYSTEM",
        content: msg,
        contentType: "text",
        type: "system",
      },
    ]);
  };

  const addChatLog = (
    sender: string,
    content: string,
    type: "public" | "secret" | "self",
    contentType: "text" | "image" | "audio" = "text",
    receiver?: string,
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        timestamp: Date.now(),
        sender: sender,
        receiver: receiver,
        content: content,
        contentType: contentType,
        type: type,
      },
    ]);
  };

  useEffect(() => {
    const initKernel = async () => {
      if (nostrRef.current) return;
      addSystemLog("Booting Zero State [v1.6 - Stable]...");

      let privKey = await storageRef.current.loadIdentity();
      if (!privKey) {
        const tempCrypto = new EncryptionService();
        privKey = tempCrypto.getPrivateKey();
        await storageRef.current.saveIdentity(privKey);
        addSystemLog("New Identity Generated.");
      }

      initializeServices(privKey);
    };

    initKernel();
  }, []);

  const initializeServices = async (privKey: string) => {
    cryptoRef.current = new EncryptionService(privKey);
    const myCurveKey = cryptoRef.current.getPublicKey();
    setMyPubKey(myCurveKey);
    addSystemLog(`Public ID: ${myCurveKey.substring(0, 8)}...`);

    const history = await storageRef.current.getRecentMessages();
    if (logs.length === 1) {
      [...history].reverse().forEach((msg) => {
        const isOut = msg.direction === "out";
        let cType: "text" | "image" | "audio" = "text";
        if (msg.type === PacketType.IMAGE_MESSAGE) cType = "image";
        if (msg.type === PacketType.AUDIO_MESSAGE) cType = "audio";
        addChatLog(
          isOut ? myCurveKey : msg.sender,
          msg.payload.toString(),
          isOut ? "self" : "public",
          cType,
        );
      });
    }

    const nostr = new NostrSignaling(privKey, myCurveKey);
    nostrRef.current = nostr;

    nostr.on("network-event", async (event) => {
      try {
        const data = JSON.parse(event.content);
        const senderNostrKey = event.pubkey;
        const senderCurveKey = data.k;

        if (senderCurveKey) peerMap.current[senderCurveKey] = senderNostrKey;

        const processPacket = async (
          binaryData: Buffer,
          sourceKey: string,
          isSecret: boolean,
        ) => {
          const packet = BinaryProtocol.deserialize(binaryData);
          let cType: "text" | "image" | "audio" = "text";
          if (packet.type === PacketType.IMAGE_MESSAGE) cType = "image";
          if (packet.type === PacketType.AUDIO_MESSAGE) cType = "audio";

          if (sourceKey !== myCurveKey || isSecret) {
            addChatLog(
              sourceKey,
              packet.payload.toString(),
              isSecret ? "secret" : "public",
              cType,
            );
            await storageRef.current.saveMessage(packet, "in", sourceKey);
          }
        };

        if (data.t === "pkt") {
          const binary = Buffer.from(data.d, "base64");
          processPacket(binary, senderCurveKey || "UNKNOWN", false);
        } else if (data.t === "enc") {
          const pTag = event.tags.find((t: string[]) => t[0] === "p");
          const targetNostrPub = pTag ? pTag[1] : null;

          if (targetNostrPub === nostr.publicKey) {
            const decrypted = cryptoRef.current?.boxDecrypt(
              data.d,
              senderCurveKey,
            );
            if (decrypted)
              processPacket(Buffer.from(decrypted), senderCurveKey, true);
          }
        }
      } catch (e) {}
    });

    await nostr.connect("zero-state-v1-global");
    addSystemLog("Uplink Established (GLOBAL).");
    setIsReady(true);
  };

  const processCommand = async (cmd: string, args: string[]) => {
    switch (cmd) {
      case "/join":
        if (args.length < 1) {
          addSystemLog("Usage: /join <room_name>");
          return true;
        }
        const topic = `zero-state-v1-${args[0]}`;
        await nostrRef.current?.connect(topic);
        setCurrentHash(args[0].toUpperCase());
        addSystemLog(`>> JOINED CHANNEL: ${args[0].toUpperCase()}`);
        return true;

      case "/key":
        if (!cryptoRef.current) return true;
        const pk = cryptoRef.current.getPrivateKey();
        addSystemLog(`>> PRIVATE KEY (DO NOT SHARE):`);
        addSystemLog(pk);
        return true;

      case "/login":
        if (args.length < 1) {
          addSystemLog("Usage: /login <private_key_hex>");
          return true;
        }
        const newKey = args[0];
        try {
          if (newKey.length !== 64) throw new Error("Invalid Key Length");
          // Ensure we close current DB before overwriting identity
          await storageRef.current.nuke();
          const newStorage = new StorageService();
          await newStorage.saveIdentity(newKey);
          addSystemLog(">> Identity Updated. Reloading...");
          setTimeout(() => window.location.reload(), 500);
        } catch (e) {
          addSystemLog("Error: Invalid Key.");
        }
        return true;

      case "/nuke":
        addSystemLog(">> INITIATING ZERO STATE PROTOCOL...");
        try {
          // FIX: Use safe nuke method that closes connection first
          await storageRef.current.nuke();
          localStorage.clear();
          addSystemLog(">> SYSTEM WIPED. RELOADING...");
          setTimeout(() => window.location.reload(), 1000);
        } catch (e: any) {
          addSystemLog(">> Wipe Error: " + e.message);
          // Force reload fallback
          setTimeout(() => window.location.reload(), 2000);
        }
        return true;

      case "/help":
        addSystemLog(
          "COMMANDS: /join <room>, /key, /login <key>, /nuke, /dm <id> <msg>",
        );
        return true;

      default:
        return false;
    }
  };

  const handleSend = async () => {
    if (!inputValue.trim() || !nostrRef.current || !cryptoRef.current) return;
    const rawInput = inputValue;
    setInputValue("");

    if (rawInput.startsWith("/")) {
      const parts = rawInput.split(" ");
      const cmd = parts[0];
      const args = parts.slice(1);
      if (cmd !== "/dm") {
        const processed = await processCommand(cmd, args);
        if (processed) return;
      }
    }

    let targetCurvePub = secureModeUser;
    let message = rawInput;

    if (!targetCurvePub && rawInput.startsWith("/dm ")) {
      const parts = rawInput.split(" ");
      if (parts.length >= 3) {
        targetCurvePub = parts[1];
        message = parts.slice(2).join(" ");
      }
    }

    if (targetCurvePub) {
      const targetNostrPub = peerMap.current[targetCurvePub];
      if (!targetNostrPub) {
        addSystemLog("Error: Route unknown.");
        return;
      }
      const packet: BitchatPacket = {
        type: PacketType.TEXT_MESSAGE,
        packetId: Math.floor(Math.random() * 1000000),
        timestamp: Math.floor(Date.now() / 1000),
        ttl: 7,
        payload: Buffer.from(message),
      };
      const binary = BinaryProtocol.serialize(packet);
      const encryptedBase64 = cryptoRef.current.boxEncrypt(
        binary,
        targetCurvePub,
      );
      await nostrRef.current.publishPrivatePacket(
        encryptedBase64,
        targetNostrPub,
      );
      addChatLog(myPubKey, message, "secret", "text", targetCurvePub);
      await storageRef.current.saveMessage(packet, "out", myPubKey);
    } else {
      const packet: BitchatPacket = {
        type: PacketType.TEXT_MESSAGE,
        packetId: Math.floor(Math.random() * 1000000),
        timestamp: Math.floor(Date.now() / 1000),
        ttl: 7,
        payload: Buffer.from(rawInput),
      };
      const binary = BinaryProtocol.serialize(packet);
      await nostrRef.current.publishPacket(binary.toString("base64"));
      addChatLog(myPubKey, rawInput, "self", "text");
      await storageRef.current.saveMessage(packet, "out", myPubKey);
    }
  };

  const handleGPS = () => {
    addSystemLog("Triangulating Position...");
    if (!navigator.geolocation) return addSystemLog("GPS Not Supported");

    navigator.geolocation.getCurrentPosition((pos) => {
      const hash = GeohashUtils.encode(
        pos.coords.latitude,
        pos.coords.longitude,
        5,
      );
      const newTopic = `zero-state-v1-${hash}`;
      setCurrentHash(hash);
      nostrRef.current?.connect(newTopic);
      setLogs([]);
      addSystemLog(`>> FREQUENCY SHIFT: ${hash.toUpperCase()}`);
    });
  };

  const handleUsernameClick = (senderPub: string) => {
    if (senderPub === myPubKey) {
      navigator.clipboard.writeText(myPubKey);
      addSystemLog(">> ID Copied.");
    } else {
      if (secureModeUser === senderPub) {
        setSecureModeUser(null);
        addSystemLog(">> Secure Channel: DISCONNECTED.");
      } else {
        setSecureModeUser(senderPub);
        addSystemLog(
          `>> Secure Channel: LOCKED to ${senderPub.substring(0, 6)}...`,
        );
        setInputValue("");
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    try {
      addSystemLog("Compressing Image...");
      const base64Image = await ImageUtils.processImage(file);
      await sendMediaPacket(base64Image, PacketType.IMAGE_MESSAGE, "image");
      addSystemLog("Image Sent.");
    } catch (err) {
      addSystemLog("Image Error: " + err);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRecording = async () => {
    if (!isReady) return;
    try {
      await audioRecorderRef.current.start();
      setIsRecording(true);
      addSystemLog("Recording...");
    } catch (e) {
      addSystemLog("Mic Error.");
    }
  };

  const stopRecordingAndSend = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    try {
      const base64Audio = await audioRecorderRef.current.stop();
      if (base64Audio) {
        await sendMediaPacket(base64Audio, PacketType.AUDIO_MESSAGE, "audio");
        addSystemLog("Voice Note Sent.");
      }
    } catch (e) {
      addSystemLog("Recording Failed.");
    }
  };

  const sendMediaPacket = async (
    base64Content: string,
    packetType: any,
    contentType: "image" | "audio",
  ) => {
    if (!cryptoRef.current || !nostrRef.current) return;
    let targetCurvePub = secureModeUser;

    const packet: BitchatPacket = {
      type: packetType,
      packetId: Math.floor(Math.random() * 1000000),
      timestamp: Math.floor(Date.now() / 1000),
      ttl: 7,
      payload: Buffer.from(base64Content),
    };
    const binary = BinaryProtocol.serialize(packet);

    if (targetCurvePub) {
      const targetNostrPub = peerMap.current[targetCurvePub];
      if (targetNostrPub) {
        const encryptedBase64 = cryptoRef.current.boxEncrypt(
          binary,
          targetCurvePub,
        );
        await nostrRef.current.publishPrivatePacket(
          encryptedBase64,
          targetNostrPub,
        );
        addChatLog(
          myPubKey,
          base64Content,
          "secret",
          contentType,
          targetCurvePub,
        );
      }
    } else {
      await nostrRef.current.publishPacket(binary.toString("base64"));
      addChatLog(myPubKey, base64Content, "self", contentType);
    }
    await storageRef.current.saveMessage(packet, "out", myPubKey);
  };

  const renderLogEntry = (log: LogEntry) => {
    if (log.type === "system")
      return <div style={{ color: "#888" }}>&gt; {log.content}</div>;

    const isMe = log.sender === myPubKey;
    const displayId = isMe ? "YOU" : log.sender.substring(0, 6);
    let prefixColor = "#00ff00";
    let prefixText = `[${displayId}]`;

    if (log.type === "secret") {
      prefixColor = "#ff00ff";
      if (isMe && log.receiver)
        prefixText = `[SECRET TO ${log.receiver.substring(0, 6)}]`;
      else prefixText = `[SECRET FROM ${log.sender.substring(0, 6)}]`;
    } else if (log.type === "self") prefixText = `[YOU]`;

    return (
      <div style={{ marginBottom: "8px", lineHeight: "1.4" }}>
        <span style={{ color: "#444", marginRight: "8px", fontSize: "12px" }}>
          {new Date(log.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <span
          onClick={() => !isMe && handleUsernameClick(log.sender)}
          style={{
            color: prefixColor,
            fontWeight: "bold",
            cursor: "pointer",
            marginRight: "8px",
            textDecoration: "underline",
          }}
        >
          {prefixText}
        </span>

        {log.contentType === "image" ? (
          <div style={{ marginTop: "5px" }}>
            <img
              src={`data:image/jpeg;base64,${log.content}`}
              style={{
                maxWidth: "200px",
                borderRadius: "4px",
                border: `1px solid ${prefixColor}`,
              }}
            />
          </div>
        ) : log.contentType === "audio" ? (
          <div style={{ marginTop: "5px" }}>
            <audio
              controls
              src={`data:audio/webm;base64,${log.content}`}
              style={{ height: "30px", maxWidth: "100%" }}
            />
          </div>
        ) : (
          <span style={{ color: "#fff" }}>: {log.content}</span>
        )}
      </div>
    );
  };

  return (
    <div
      style={{
        backgroundColor: "#0a0a0a",
        color: "#e0e0e0",
        height: "100vh",
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
        padding: "20px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <h1
          style={{
            margin: "0",
            color: secureModeUser ? "#ff00ff" : "#00ff00",
            fontSize: "20px",
          }}
        >
          ZERO // {secureModeUser ? "SECURE" : currentHash}
        </h1>
        <button
          onClick={handleGPS}
          style={{
            background: "#333",
            color: "#00ff00",
            border: "1px solid #00ff00",
            padding: "5px 10px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
          title="Switch to Nearby Frequency"
        >
          GPS SCAN
        </button>
      </div>

      <div
        style={{
          flex: 1,
          border: `1px solid ${secureModeUser ? "#ff00ff" : "#333"}`,
          padding: "15px",
          overflowY: "auto",
          marginBottom: "20px",
          backgroundColor: "#000",
        }}
      >
        {logs.map((log) => (
          <div key={log.id}>{renderLogEntry(log)}</div>
        ))}
        <div ref={logsEndRef} />
      </div>

      <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!isReady}
          style={{
            background: "#333",
            color: "#fff",
            border: "1px solid #555",
            padding: "12px",
            cursor: "pointer",
            fontWeight: "bold",
          }}
        >
          IMG
        </button>
        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecordingAndSend}
          onTouchStart={startRecording}
          onTouchEnd={stopRecordingAndSend}
          disabled={!isReady}
          style={{
            background: isRecording ? "#ff0000" : "#333",
            color: "#fff",
            border: "1px solid #555",
            padding: "12px",
            cursor: "pointer",
            fontWeight: "bold",
            minWidth: "50px",
          }}
        >
          {isRecording ? "REC" : "MIC"}
        </button>

        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={!isReady}
          placeholder={
            isReady
              ? secureModeUser
                ? `[SECURE] Message...`
                : "Message or /help"
              : "Initializing..."
          }
          style={{
            flex: 1,
            background: "#111",
            border: `1px solid ${secureModeUser ? "#ff00ff" : "#444"}`,
            color: secureModeUser ? "#ffccff" : "#fff",
            padding: "12px",
            fontFamily: "monospace",
          }}
        />
        <button
          onClick={handleSend}
          disabled={!isReady}
          style={{
            background: isReady
              ? secureModeUser
                ? "#ff00ff"
                : "#00ff00"
              : "#333",
            color: "#000",
            border: "none",
            padding: "10px 30px",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          SEND
        </button>
      </div>
    </div>
  );
}

export default App;
