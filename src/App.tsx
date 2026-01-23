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
// FIX: Removed unused 'Lock' and 'Radio' imports
import { Camera, Mic, Send, MapPin, Square } from "lucide-react";
import "./App.css";

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
    timestamp: number = Date.now(),
  ) => {
    setLogs((prev) => [
      ...prev,
      {
        id: Math.random().toString(36).substring(7),
        timestamp: timestamp,
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
      addSystemLog("Booting Zero State [v2.3 - Stable]...");

      // Prune old messages (older than 24 hours)
      await storageRef.current.pruneMessages(86400);

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

    const history = await storageRef.current.getRecentMessages();
    if (logs.length === 1) {
      [...history].reverse().forEach((msg) => {
        const isOut = msg.direction === "out";
        let cType: "text" | "image" | "audio" = "text";
        if (msg.type === PacketType.IMAGE_MESSAGE) cType = "image";
        if (msg.type === PacketType.AUDIO_MESSAGE) cType = "audio";

        // Use original timestamp
        addChatLog(
          isOut ? myCurveKey : msg.sender,
          msg.payload.toString(),
          isOut ? "self" : "public",
          cType,
          undefined,
          msg.timestamp * 1000,
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
    setIsReady(true);
  };

  const processCommand = async (cmd: string, args: string[]) => {
    switch (cmd) {
      case "/join":
        if (args.length < 1) {
          addSystemLog("Usage: /join <room>");
          return true;
        }
        const topic = `zero-state-v1-${args[0]}`;
        await nostrRef.current?.connect(topic);
        setCurrentHash(args[0].toUpperCase());
        addSystemLog(`>> JOINED: ${args[0].toUpperCase()}`);
        return true;
      case "/key":
        if (!cryptoRef.current) return true;
        addSystemLog(`PRIVATE KEY: ${cryptoRef.current.getPrivateKey()}`);
        return true;
      case "/login":
        if (args.length < 1) {
          addSystemLog("Usage: /login <key>");
          return true;
        }
        const newKey = args[0];
        try {
          if (newKey.length !== 64) throw new Error("Invalid Key");
          await storageRef.current.nuke();
          const newStorage = new StorageService();
          await newStorage.saveIdentity(newKey);
          window.location.reload();
        } catch (e) {
          addSystemLog("Invalid Key");
        }
        return true;
      case "/nuke":
        await storageRef.current.nuke();
        localStorage.clear();
        window.location.reload();
        return true;
      case "/help":
        addSystemLog("/join <room>, /key, /login, /nuke, /dm <id>");
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
    addSystemLog("Scanning GPS...");
    if (!navigator.geolocation) return addSystemLog("No GPS Hardware");
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
      addSystemLog(`>> FREQUENCY: ${hash.toUpperCase()}`);
    });
  };

  const handleUsernameClick = (senderPub: string) => {
    if (senderPub === myPubKey) {
      navigator.clipboard.writeText(myPubKey);
      addSystemLog(">> ID Copied.");
    } else {
      if (secureModeUser === senderPub) {
        setSecureModeUser(null);
        addSystemLog(">> CHANNEL UNLOCKED.");
      } else {
        setSecureModeUser(senderPub);
        addSystemLog(`>> SECURE CHANNEL LOCKED.`);
        setInputValue("");
      }
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0]) return;
    const file = e.target.files[0];
    try {
      addSystemLog("Processing Image...");
      const base64Image = await ImageUtils.processImage(file);
      await sendMediaPacket(base64Image, PacketType.IMAGE_MESSAGE, "image");
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
    } catch (e) {
      addSystemLog("Mic Error.");
    }
  };

  const stopRecordingAndSend = async () => {
    if (!isRecording) return;
    setIsRecording(false);
    try {
      const base64Audio = await audioRecorderRef.current.stop();
      if (base64Audio)
        await sendMediaPacket(base64Audio, PacketType.AUDIO_MESSAGE, "audio");
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
    if (log.type === "system") {
      return (
        <div key={log.id} className="system-log">
          {log.content}
        </div>
      );
    }

    const isMe = log.sender === myPubKey;
    const isSecret = log.type === "secret";
    const displayId = isMe ? "YOU" : log.sender.substring(0, 6);
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    const alignmentClass = isMe ? "self" : "other";
    const modeClass = isSecret ? "secure" : "public";

    return (
      <div
        key={log.id}
        className={`message-block ${alignmentClass} ${modeClass}`}
      >
        <div className="message-header">
          <span
            onClick={() => !isMe && handleUsernameClick(log.sender)}
            className={`user-id ${alignmentClass}`}
            style={{
              color: isSecret
                ? "#ff00ff"
                : isMe
                  ? "var(--accent-color)"
                  : "#00ccff",
            }}
          >
            {isSecret ? "🔒 " : ""}
            {displayId}
          </span>
          <span>{timeStr}</span>
        </div>

        <div className="message-content">
          {log.contentType === "image" ? (
            <img
              src={`data:image/jpeg;base64,${log.content}`}
              style={{
                maxWidth: "100%",
                borderRadius: "4px",
                border: "1px solid #333",
              }}
            />
          ) : log.contentType === "audio" ? (
            <audio
              controls
              src={`data:audio/webm;base64,${log.content}`}
              style={{ height: "32px", maxWidth: "100%" }}
            />
          ) : (
            log.content
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={`app-container ${secureModeUser ? "secure-mode" : "public-mode"}`}
    >
      <div className="header">
        <div>
          <div className="header-title">ZERO STATE</div>
          <div className="header-subtitle">
            {secureModeUser ? "SECURE UPLINK ACTIVE" : `FREQ: ${currentHash}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button onClick={handleGPS} className="gps-btn">
            <MapPin size={12} style={{ marginRight: "4px" }} />
            GPS
          </button>
        </div>
      </div>

      <div className="chat-area">
        {logs.map((log) => renderLogEntry(log))}
        <div ref={logsEndRef} />
      </div>

      <div className="control-deck">
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
          className="icon-btn"
          title="Send Image"
        >
          <Camera size={24} />
        </button>

        <button
          onMouseDown={startRecording}
          onMouseUp={stopRecordingAndSend}
          onTouchStart={startRecording}
          onTouchEnd={stopRecordingAndSend}
          disabled={!isReady}
          className={`icon-btn ${isRecording ? "recording" : ""}`}
          title="Hold to Record"
        >
          {isRecording ? (
            <Square size={20} fill="currentColor" />
          ) : (
            <Mic size={24} />
          )}
        </button>

        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          disabled={!isReady}
          placeholder={
            secureModeUser
              ? `Message ${secureModeUser.substring(0, 4)}...`
              : "Message..."
          }
          className="chat-input"
        />

        <button
          onClick={handleSend}
          disabled={!isReady}
          className="icon-btn send"
        >
          <Send size={20} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

export default App;
