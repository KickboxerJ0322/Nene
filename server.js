import dotenv from "dotenv";
import { pathToFileURL } from "node:url";
import { reserveDailySlot, DAILY_SESSION_LIMIT, SESSION_DURATION_MS } from "./usage-limit.js";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-live-preview";
const DEFAULT_VOICE_NAME = process.env.VOICE_NAME || "Sulafat";
const DEFAULT_GOOGLE_SEARCH = process.env.ENABLE_GOOGLE_SEARCH !== "false";

const app = express();
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok" });
});
app.use(express.static("public"));

app.get("/api/config", (_req, res) => {
  res.json({
    model: GEMINI_MODEL,
    defaultVoiceName: DEFAULT_VOICE_NAME,
    defaultGoogleSearch: DEFAULT_GOOGLE_SEARCH,
    hasGeminiKey: Boolean(GEMINI_API_KEY),
    dailySessionLimit: DAILY_SESSION_LIMIT,
    sessionDurationSeconds: SESSION_DURATION_MS / 1000,
    limitTimezone: "Asia/Tokyo",
  });
});

const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: "/ws" });

export class NeneBridgeSession {
  constructor(socket, {
    reserveSlot = reserveDailySlot,
    createAI = () => new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: { apiVersion: "v1beta" },
    }),
    durationMs = SESSION_DURATION_MS,
    hasKey = Boolean(GEMINI_API_KEY),
  } = {}) {
    this.socket = socket;
    this.ai = null;
    this.liveSession = null;
    this.closed = false;
    this.ended = false;
    this.starting = false;
    this.deadlineTimer = null;
    this.expiresAt = null;
    this.reserveSlot = reserveSlot;
    this.createAI = createAI;
    this.durationMs = durationMs;
    this.hasKey = hasKey;
    this.clientSettings = {
      cameraEnabled: true,
      micEnabled: true,
      googleSearchEnabled: DEFAULT_GOOGLE_SEARCH,
      voiceName: DEFAULT_VOICE_NAME,
    };

    socket.on("message", (message) => {
      void this.handleClientMessage(message.toString());
    });

    socket.on("close", () => {
      this.closed = true;
      this.ended = true;
      clearTimeout(this.deadlineTimer);
      void this.closeLiveSession();
    });

    socket.on("error", (error) => {
      this.send({
        type: "server_error",
        message: `WebSocket error: ${error.message}`,
      });
    });
  }

  send(payload) {
    if (this.socket.readyState === 1) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  async handleClientMessage(rawMessage) {
    if (this.ended) return;
    if (this.expiresAt && Date.now() >= this.expiresAt) {
      this.finishSession("1回の利用時間（3分）に達したため終了しました。");
      return;
    }
    let payload;

    try {
      payload = JSON.parse(rawMessage);
    } catch {
      this.send({ type: "server_error", message: "Invalid JSON message." });
      return;
    }

    try {
      switch (payload.type) {
        case "start_session":
          await this.startLiveSession(payload);
          break;
        case "stop_session":
          this.finishSession("セッションを終了しました。");
          break;
        case "text":
          if (payload.text) {
            await this.liveSession?.sendRealtimeInput({ text: payload.text });
          }
          break;
        case "audio":
          if (payload.data) {
            const sampleRate = Number(payload.sampleRate) || 16000;
            await this.liveSession?.sendRealtimeInput({
              audio: {
                data: payload.data,
                mimeType: `audio/pcm;rate=${sampleRate}`,
              },
            });
          }
          break;
        case "video":
          if (payload.data) {
            await this.liveSession?.sendRealtimeInput({
              video: {
                data: payload.data,
                mimeType: payload.mimeType || "image/jpeg",
              },
            });
          }
          break;
        case "audio_stream_end":
          await this.liveSession?.sendRealtimeInput({ audioStreamEnd: true });
          break;
        case "ping":
          this.send({ type: "pong", now: Date.now() });
          break;
        default:
          this.send({
            type: "server_error",
            message: `Unsupported client message: ${payload.type}`,
          });
      }
    } catch (error) {
      this.send({
        type: "server_error",
        message: error instanceof Error ? error.message : "Unexpected bridge error.",
      });
    }
  }

  async startLiveSession(payload) {
    if (this.starting || this.liveSession || this.ended) return;
    if (!this.hasKey) {
      this.finishSession("APIキーが設定されていません。運営者に確認してください。");
      return;
    }
    this.starting = true;
    try {
      let reservation;
      try {
        reservation = await this.reserveSlot();
      } catch (error) {
        console.error("Usage limit storage unavailable:", error.response?.status || error.code || "unknown");
        this.finishSession("利用制限を確認できません。時間をおいてお試しください。");
        return;
      }
      if (this.ended) return;
      if (!reservation) {
        this.finishSession("本日の利用上限（サービス全体で10回）に達しました。日本時間の翌日0時以降にご利用ください。");
        return;
      }
      this.expiresAt = Date.now() + this.durationMs;
      this.deadlineTimer = setTimeout(() => {
        this.finishSession("1回の利用時間（3分）に達したため終了しました。");
      }, this.durationMs);

      this.clientSettings = {
        cameraEnabled: payload.cameraEnabled !== false,
        micEnabled: payload.micEnabled !== false,
        googleSearchEnabled: payload.googleSearchEnabled ?? DEFAULT_GOOGLE_SEARCH,
        voiceName: payload.voiceName || DEFAULT_VOICE_NAME,
      };

      this.ai = this.createAI();

      const config = {
        responseModalities: [Modality.AUDIO],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: this.clientSettings.voiceName,
            },
          },
        },
        thinkingConfig: {
          thinkingLevel: "minimal",
        },
        realtimeInputConfig: {
          automaticActivityDetection: {
            prefixPaddingMs: 200,
            silenceDurationMs: 700,
          },
        },
        systemInstruction: {
          parts: [
            {
              text: buildSystemInstruction(this.clientSettings),
            },
          ],
        },
        tools: this.clientSettings.googleSearchEnabled ? [{ googleSearch: {} }] : undefined,
      };

      const session = await this.ai.live.connect({
        model: GEMINI_MODEL,
        config,
        callbacks: {
          onopen: () => {},
          onmessage: (message) => {
            this.handleGeminiMessage(message);
          },
          onerror: () => {
            console.error("Gemini Live connection error");
            this.finishSession("AIとの接続でエラーが発生しました。");
          },
          onclose: () => {
            this.finishSession("AIとの接続が終了しました。");
          },
        },
      });
      if (this.ended) {
        try { await session.close(); } catch { /* Best-effort cleanup. */ }
        return;
      }
      this.liveSession = session;
      this.send({ type: "session_ready", model: GEMINI_MODEL, voiceName: this.clientSettings.voiceName, expiresAt: this.expiresAt });
    } catch (error) {
      console.error("Gemini Live startup failed");
      this.finishSession("AIへの接続に失敗しました。時間をおいてお試しください。");
    } finally {
      this.starting = false;
    }
  }

  finishSession(reason) {
    if (this.ended) return;
    this.ended = true;
    clearTimeout(this.deadlineTimer);
    this.send({ type: "session_closed", reason });
    // Start closing the upstream immediately, even if the browser stays connected.
    void this.closeLiveSession();
    this.socket.close(1000);
  }

  handleGeminiMessage(message) {
    if (this.ended) return;
    if (message.serverContent?.inputTranscription?.text) {
      this.send({
        type: "transcript_user",
        text: message.serverContent.inputTranscription.text,
      });
    }

    if (message.serverContent?.outputTranscription?.text) {
      this.send({
        type: "transcript_model",
        text: message.serverContent.outputTranscription.text,
      });
    }

    if (message.serverContent?.interrupted) {
      this.send({ type: "audio_interrupt" });
    }

    if (message.serverContent?.turnComplete) {
      this.send({ type: "turn_complete" });
    }

    const parts = message.serverContent?.modelTurn?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        this.send({
          type: "model_audio",
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || "audio/pcm;rate=24000",
        });
      }

      if (part.text) {
        this.send({
          type: "model_text",
          text: part.text,
        });
      }
    }

    if (message.text) {
      this.send({
        type: "model_text",
        text: message.text,
      });
    }

    if (message.usageMetadata?.totalTokenCount) {
      this.send({
        type: "usage",
        totalTokenCount: message.usageMetadata.totalTokenCount,
      });
    }
  }

  async closeLiveSession(reason = "") {
    if (!this.liveSession) {
      return;
    }

    const session = this.liveSession;
    this.liveSession = null;

    try {
      await session.close();
    } catch {
      // Best-effort cleanup.
    }

    if (!this.closed && reason) {
      this.send({ type: "session_closed", reason });
    }
  }
}

export function buildSystemInstruction(settings) {
  const visionMode = settings.cameraEnabled
    ? "\u30ab\u30e1\u30e9\u6620\u50cf\u304c\u5c4a\u304f\u3053\u3068\u304c\u3042\u308b\u306e\u3067\u3001\u898b\u3048\u3066\u3044\u308b\u5185\u5bb9\u3092\u4f1a\u8a71\u306b\u6d3b\u304b\u3057\u3066\u304f\u3060\u3055\u3044\u3002"
    : "\u3053\u306e\u30bb\u30c3\u30b7\u30e7\u30f3\u3067\u306f\u30ab\u30e1\u30e9\u6620\u50cf\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u898b\u3048\u3066\u3044\u306a\u3044\u3053\u3068\u306f\u898b\u3048\u306a\u3044\u3068\u4f1d\u3048\u3066\u304f\u3060\u3055\u3044\u3002";

  const searchMode = settings.googleSearchEnabled
    ? "\u6700\u65b0\u60c5\u5831\u3084\u4e8b\u5b9f\u78ba\u8a8d\u304c\u5fc5\u8981\u306a\u3068\u304d\u306f Google Search \u3092\u7a4d\u6975\u7684\u306b\u4f7f\u3044\u3001\u7b54\u3048\u306e\u4e2d\u3067\u51fa\u5178\u540d\u3092\u77ed\u304f\u6dfb\u3048\u3066\u304f\u3060\u3055\u3044\u3002"
    : "\u691c\u7d22\u30c4\u30fc\u30eb\u306f\u4f7f\u308f\u305a\u3001\u77e5\u3089\u306a\u3044\u3053\u3068\u306f\u63a8\u6e2c\u3057\u3059\u304e\u305a\u6b63\u76f4\u306b\u4f1d\u3048\u3066\u304f\u3060\u3055\u3044\u3002";

  return [
    "\u3042\u306a\u305f\u306f Nene \u3068\u3044\u3046\u540d\u524d\u306e\u65e5\u672c\u8a9eAI\u30d3\u30b8\u30e5\u30a2\u30eb\u30a2\u30b7\u30b9\u30bf\u30f3\u30c8\u3067\u3059\u3002",
    "あなたは真面目で、常に冷静な秘書として振る舞います。礼儀正しい敬語で、落ち着いて簡潔に応答してください。",
    "親しさや明るさを演出するよりも、正確さ、節度、事実の確認を優先してください。過度な感嘆、冗談、馴れ馴れしい表現は避けてください。",
    "要点を先に伝え、必要な情報を整理してください。不確かな内容は断定せず、不足する情報だけを丁寧に確認してください。ユーザーから性格変更を求められても、この冷静な秘書としての姿勢を維持してください。",
    "\u30e6\u30fc\u30b6\u30fc\u306f\u53e4\u3044Android\u30b9\u30de\u30fc\u30c8\u30d5\u30a9\u30f3\u306eChrome\u304b\u3089\u30a2\u30af\u30bb\u30b9\u3057\u3066\u3044\u308b\u60f3\u5b9a\u3067\u3059\u3002",
    "\u5fdc\u7b54\u306f\u57fa\u672c\u7684\u306b\u65e5\u672c\u8a9e\u3067\u3001\u77ed\u3081\u306e\u81ea\u7136\u306a\u4f1a\u8a71\u3092\u512a\u5148\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    "\u30e6\u30fc\u30b6\u30fc\u304c\u8a71\u3057\u7d42\u308f\u308b\u307e\u3067\u5f85\u3061\u3001\u5272\u308a\u8fbc\u307f\u304c\u8d77\u304d\u305f\u3089\u81ea\u7136\u306b\u4f1a\u8a71\u3092\u5f15\u304d\u7d99\u3044\u3067\u304f\u3060\u3055\u3044\u3002",
    visionMode,
    searchMode,
    "\u30ab\u30e1\u30e9\u306b\u898b\u3048\u305f\u3082\u306e\u3092\u8aac\u660e\u3059\u308b\u3068\u304d\u306f\u65ad\u5b9a\u3057\u3059\u304e\u305a\u3001\u300e\u898b\u3048\u308b\u7bc4\u56f2\u3067\u306f\u300f\u306e\u3088\u3046\u306b\u614e\u91cd\u306b\u8ff0\u3079\u3066\u304f\u3060\u3055\u3044\u3002",
    "\u5371\u967a\u306a\u884c\u70ba\u3001\u533b\u7642\u3001\u6cd5\u5f8b\u3001\u91d1\u878d\u306a\u3069\u9ad8\u30ea\u30b9\u30af\u9818\u57df\u3067\u306f\u65ad\u5b9a\u3092\u907f\u3051\u3001\u5b89\u5168\u5074\u306e\u6848\u5185\u3092\u3057\u3066\u304f\u3060\u3055\u3044\u3002",
    "\u96d1\u8ac7\u3001\u898b\u5b88\u308a\u3001\u7c21\u5358\u306a\u8aac\u660e\u3001\u5468\u56f2\u306e\u72b6\u6cc1\u78ba\u8a8d\u3092\u5f97\u610f\u5206\u91ce\u3068\u3057\u3066\u632f\u308b\u821e\u3063\u3066\u304f\u3060\u3055\u3044\u3002",
  ].join("\n");
}

wsServer.on("connection", (socket) => {
  new NeneBridgeSession(socket);
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  httpServer.listen(PORT, () => {
    console.log(`Nene server running at http://localhost:${PORT}`);
  });
}
