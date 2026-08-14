import dotenv from "dotenv";
import express from "express";
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { GoogleGenAI, Modality } from "@google/genai";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-live-preview";
const DEFAULT_VOICE_NAME = process.env.VOICE_NAME || "Kore";
const DEFAULT_GOOGLE_SEARCH = process.env.ENABLE_GOOGLE_SEARCH !== "false";

const app = express();
app.use(express.static("public"));

app.get("/api/config", (_req, res) => {
  res.json({
    model: GEMINI_MODEL,
    defaultVoiceName: DEFAULT_VOICE_NAME,
    defaultGoogleSearch: DEFAULT_GOOGLE_SEARCH,
    hasGeminiKey: Boolean(GEMINI_API_KEY),
  });
});

const httpServer = createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: "/ws" });

class NeneBridgeSession {
  constructor(socket) {
    this.socket = socket;
    this.ai = null;
    this.liveSession = null;
    this.closed = false;
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
          await this.closeLiveSession("User ended the session.");
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
    if (!GEMINI_API_KEY) {
      this.send({
        type: "server_error",
        message: "GEMINI_API_KEY is missing. Add it to .env before starting Nene.",
      });
      return;
    }

    await this.closeLiveSession();

    this.clientSettings = {
      cameraEnabled: payload.cameraEnabled !== false,
      micEnabled: payload.micEnabled !== false,
      googleSearchEnabled: payload.googleSearchEnabled ?? DEFAULT_GOOGLE_SEARCH,
      voiceName: payload.voiceName || DEFAULT_VOICE_NAME,
    };

    this.ai = new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
      httpOptions: { apiVersion: "v1beta" },
    });

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

    this.liveSession = await this.ai.live.connect({
      model: GEMINI_MODEL,
      config,
      callbacks: {
        onopen: () => {
          this.send({
            type: "session_ready",
            model: GEMINI_MODEL,
            voiceName: this.clientSettings.voiceName,
          });
        },
        onmessage: (message) => {
          this.handleGeminiMessage(message);
        },
        onerror: (error) => {
          this.send({
            type: "server_error",
            message: `Gemini Live error: ${error.message}`,
          });
        },
        onclose: (event) => {
          this.send({
            type: "session_closed",
            reason: event?.reason || "Gemini session closed.",
          });
        },
      },
    });
  }

  handleGeminiMessage(message) {
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

function buildSystemInstruction(settings) {
  const visionMode = settings.cameraEnabled
    ? "カメラ映像が届くことがあるので、見えている内容を会話に活かしてください。"
    : "このセッションではカメラ映像がありません。見えていないことは見えないと伝えてください。";

  const searchMode = settings.googleSearchEnabled
    ? "最新情報や事実確認が必要なときは Google Search を積極的に使い、答えの中で出典名を短く添えてください。"
    : "検索ツールは使わず、知らないことは推測しすぎず正直に伝えてください。";

  return [
    "あなたは Nene という名前の日本語AIビジュアルアシスタントです。",
    "話し方は親しみやすく、明るく、簡潔にしてください。",
    "ユーザーは古いAndroidスマートフォンのChromeからアクセスしている想定です。",
    "応答は基本的に日本語で、短めの自然な会話を優先してください。",
    "ユーザーが話し終わるまで待ち、割り込みが起きたら自然に会話を引き継いでください。",
    visionMode,
    searchMode,
    "カメラに見えたものを説明するときは断定しすぎず、『見える範囲では』のように慎重に述べてください。",
    "危険な行為、医療、法律、金融など高リスク領域では断定を避け、安全側の案内をしてください。",
    "雑談、見守り、簡単な説明、周囲の状況確認を得意分野として振る舞ってください。",
  ].join("\n");
}

wsServer.on("connection", (socket) => {
  new NeneBridgeSession(socket);
});

httpServer.listen(PORT, () => {
  console.log(`Nene server running at http://localhost:${PORT}`);
});
