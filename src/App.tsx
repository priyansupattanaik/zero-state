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
  // --- STATE & REFS (Logic Unchanged) ---
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

  // --- SCROLLING ---
  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };
  useEffect(scrollToBottom, [logs]);

  // --- LOGGING HELPERS ---
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

  // --- KERNEL BOOTSTRAP ---
  useEffect(() => {
    const initKernel = async () => {
      if (nostrRef.current) return;
      addSystemLog("Booting Zero State [Neo-UI v2.0]...");

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

    // Load History
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

    // Start Network
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

  // --- COMMAND PROCESSOR ---
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

  // --- ACTION HANDLERS ---
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

  // --- NEO-TERMINAL UI RENDERER ---
  const renderLogEntry = (log: LogEntry) => {
    if (log.type === "system") {
      return (
        <div
          style={{
            textAlign: "center",
            color: "#666",
            fontSize: "12px",
            margin: "10px 0",
            borderBottom: "1px dashed #222",
            paddingBottom: "5px",
          }}
        >
          {log.content}
        </div>
      );
    }

    const isMe = log.sender === myPubKey;
    const isSecret = log.type === "secret";

    // Dynamic Styles based on type
    const blockStyle: React.CSSProperties = {
      backgroundColor: isSecret ? "#1a051a" : "#111",
      border: `1px solid ${isSecret ? "#ff00ff" : "#333"}`,
      borderRadius: isMe ? "8px 8px 0 8px" : "8px 8px 8px 0",
      padding: "10px",
      maxWidth: "85%",
      alignSelf: isMe ? "flex-end" : "flex-start",
      animation: "fadeIn 0.2s ease-out",
      boxShadow: isSecret ? "0 0 5px rgba(255, 0, 255, 0.2)" : "none",
    };

    const displayId = isMe ? "YOU" : log.sender.substring(0, 6);
    const timeStr = new Date(log.timestamp).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    return (
      <div style={blockStyle}>
        {/* Header: ID + Time */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: "5px",
            fontSize: "11px",
            color: "#666",
          }}
        >
          <span
            onClick={() => !isMe && handleUsernameClick(log.sender)}
            style={{
              color: isSecret ? "#ff00ff" : isMe ? "#00ff00" : "#00ccff",
              fontWeight: "bold",
              cursor: isMe ? "default" : "pointer",
              textDecoration: isMe ? "none" : "underline",
            }}
          >
            {isSecret ? "🔒 " : ""}
            {displayId}
          </span>
          <span>{timeStr}</span>
        </div>

        {/* Content */}
        <div
          style={{
            color: "#e0e0e0",
            wordBreak: "break-word",
            fontSize: "14px",
            lineHeight: "1.5",
          }}
        >
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
    <>
      {/* Global Styles for Scrollbars & Animations */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;700&display=swap');
        body { margin: 0; background-color: #050505; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: #000; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
    `}</style>

      <div
        style={{
          backgroundColor: "#050505",
          color: "#e0e0e0",
          height: "100dvh", // Dynamic viewport height for mobile
          fontFamily: "'Fira Code', monospace",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* --- HEADER --- */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 15px",
            borderBottom: `1px solid ${secureModeUser ? "#ff00ff" : "#333"}`,
            backgroundColor: "#0a0a0a",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "16px",
                fontWeight: "bold",
                color: secureModeUser ? "#ff00ff" : "#00ff00",
              }}
            >
              ZERO STATE
            </div>
            <div style={{ fontSize: "10px", color: "#666" }}>
              {secureModeUser ? "SECURE UPLINK ACTIVE" : `FREQ: ${currentHash}`}
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleGPS}
              style={{
                background: "transparent",
                color: "#00ff00",
                border: "1px solid #00ff00",
                padding: "4px 8px",
                fontSize: "10px",
                cursor: "pointer",
                borderRadius: "4px",
              }}
            >
              GPS
            </button>
          </div>
        </div>

        {/* --- CHAT AREA --- */}
        <div
          style={{
            flex: 1,
            padding: "15px",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "10px",
          }}
        >
          {logs.map((log) => (
            <div key={log.id}>{renderLogEntry(log)}</div>
          ))}
          <div ref={logsEndRef} />
        </div>

        {/* --- CONTROL DECK (INPUT) --- */}
        <div
          style={{
            padding: "10px",
            backgroundColor: "#0a0a0a",
            borderTop: `1px solid ${secureModeUser ? "#ff00ff" : "#333"}`,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />

          {/* IMG Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={!isReady}
            style={{
              background: "#1a1a1a",
              color: "#ccc",
              border: "1px solid #333",
              borderRadius: "4px",
              width: "44px",
              height: "44px", // Touch friendly
              cursor: "pointer",
              fontSize: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Send Image"
          >
            📷
          </button>

          {/* MIC Button */}
          <button
            onMouseDown={startRecording}
            onMouseUp={stopRecordingAndSend}
            onTouchStart={startRecording}
            onTouchEnd={stopRecordingAndSend}
            disabled={!isReady}
            style={{
              background: isRecording ? "#990000" : "#1a1a1a",
              color: isRecording ? "#fff" : "#ccc",
              border: `1px solid ${isRecording ? "#ff0000" : "#333"}`,
              borderRadius: "4px",
              width: "44px",
              height: "44px",
              cursor: "pointer",
              fontSize: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            title="Hold to Record"
          >
            {isRecording ? "●" : "🎤"}
          </button>

          {/* Text Input */}
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
            style={{
              flex: 1,
              height: "44px",
              background: "#050505",
              border: `1px solid ${secureModeUser ? "#ff00ff" : "#333"}`,
              borderRadius: "4px",
              color: secureModeUser ? "#ffccff" : "#fff",
              padding: "0 12px",
              fontFamily: "'Fira Code', monospace",
              fontSize: "16px", // Prevents iOS zoom
            }}
          />

          {/* SEND Button */}
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
              borderRadius: "4px",
              width: "44px",
              height: "44px",
              cursor: "pointer",
              fontWeight: "bold",
              fontSize: "18px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ➤
          </button>
        </div>
      </div>
    </>
  );
}

export default App;
