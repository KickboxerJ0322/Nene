const state = {
  socket: null,
  sessionLive: false,
  bridgeReady: false,
  config: null,
  cameraStream: null,
  micStream: null,
  inputAudioContext: null,
  inputProcessor: null,
  inputSource: null,
  outputAudioContext: null,
  playbackTime: 0,
  activeSources: new Set(),
  cameraIntervalId: null,
  wakeLock: null,
};

const elements = {
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  cameraToggle: document.querySelector("#cameraToggle"),
  cameraEnabled: document.querySelector("#cameraEnabled"),
  micEnabled: document.querySelector("#micEnabled"),
  searchEnabled: document.querySelector("#searchEnabled"),
  voiceName: document.querySelector("#voiceName"),
  textForm: document.querySelector("#textForm"),
  textInput: document.querySelector("#textInput"),
  transcriptList: document.querySelector("#transcriptList"),
  cameraPreview: document.querySelector("#cameraPreview"),
  cameraFallback: document.querySelector("#cameraFallback"),
  captureCanvas: document.querySelector("#captureCanvas"),
  statusText: document.querySelector("#statusText"),
  statusDot: document.querySelector("#statusDot"),
  tokenCounter: document.querySelector("#tokenCounter"),
  modelBadge: document.querySelector("#modelBadge"),
};

boot().catch((error) => {
  setStatus(`初期化エラー: ${error.message}`, "error");
  appendMessage("system", `初期化に失敗しました: ${error.message}`);
});

async function boot() {
  const response = await fetch("/api/config");
  state.config = await response.json();

  elements.voiceName.value = state.config.defaultVoiceName || "Kore";
  elements.searchEnabled.checked = state.config.defaultGoogleSearch ?? true;
  elements.modelBadge.textContent = state.config.model || "Gemini Live";

  if (!state.config.hasGeminiKey) {
    appendMessage("system", "`.env` に `GEMINI_API_KEY` を入れると音声会話を開始できます。");
    setStatus("APIキー未設定", "error");
  } else {
    appendMessage("system", "Neneの準備ができています。起動ボタンからセッションを始めてください。");
  }

  elements.connectButton.addEventListener("click", () => {
    void startSession();
  });

  elements.disconnectButton.addEventListener("click", () => {
    void stopSession("ユーザーが終了しました。");
  });

  elements.cameraToggle.addEventListener("click", () => {
    elements.cameraEnabled.checked = !elements.cameraEnabled.checked;
    syncCameraToggleLabel();
    void applyCameraState();
  });

  elements.cameraEnabled.addEventListener("change", () => {
    syncCameraToggleLabel();
    void applyCameraState();
  });

  elements.micEnabled.addEventListener("change", () => {
    void applyMicrophoneState();
  });

  elements.textForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendTextMessage();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.sessionLive) {
      void requestWakeLock();
    }
  });

  syncCameraToggleLabel();
}

async function startSession() {
  if (state.sessionLive) {
    return;
  }

  setStatus("起動中...", "idle");
  elements.connectButton.disabled = true;

  try {
    await ensureOutputAudioContext();
    await applyCameraState();
    await applyMicrophoneState();
    await requestWakeLock();
    openSocket();
  } catch (error) {
    setStatus(`起動失敗: ${error.message}`, "error");
    elements.connectButton.disabled = false;
  }
}

function openSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    state.sessionLive = true;
    setStatus("Neneに接続しています...", "idle");
    elements.disconnectButton.disabled = false;
    appendMessage("system", "Gemini Live セッションを開始しています。");

    sendSocketMessage({
      type: "start_session",
      cameraEnabled: elements.cameraEnabled.checked,
      micEnabled: elements.micEnabled.checked,
      googleSearchEnabled: elements.searchEnabled.checked,
      voiceName: elements.voiceName.value.trim() || "Kore",
    });
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    handleServerMessage(payload);
  });

  socket.addEventListener("close", () => {
    cleanupSocketState();
  });

  socket.addEventListener("error", () => {
    setStatus("WebSocket接続エラー", "error");
  });
}

function handleServerMessage(payload) {
  switch (payload.type) {
    case "session_ready":
      state.bridgeReady = true;
      setStatus("会話できます", "live");
      appendMessage("system", `${payload.model} / Voice: ${payload.voiceName} で準備完了です。`);
      break;
    case "transcript_user":
      upsertTranscript("user", payload.text);
      break;
    case "transcript_model":
      upsertTranscript("model", payload.text);
      break;
    case "model_text":
      upsertTranscript("model", payload.text);
      break;
    case "model_audio":
      void playModelAudio(payload.data, payload.mimeType);
      break;
    case "audio_interrupt":
      clearPlaybackQueue();
      appendMessage("system", "ユーザーの割り込みを検知したため、Neneの音声再生を中断しました。");
      break;
    case "usage":
      elements.tokenCounter.textContent = `Tokens: ${payload.totalTokenCount}`;
      break;
    case "session_closed":
      appendMessage("system", payload.reason || "セッションが閉じられました。");
      break;
    case "server_error":
      appendMessage("system", payload.message);
      setStatus(payload.message, "error");
      break;
    case "turn_complete":
    case "pong":
      break;
    default:
      appendMessage("system", `未処理イベント: ${payload.type}`);
  }
}

async function stopSession(reason = "セッションを終了しました。") {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    sendSocketMessage({ type: "stop_session" });
    state.socket.close();
  }

  await releaseWakeLock();
  clearPlaybackQueue();
  cleanupSocketState();
  appendMessage("system", reason);
}

function cleanupSocketState() {
  state.bridgeReady = false;
  state.sessionLive = false;
  state.socket = null;
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  setStatus("未接続", "idle");
}

async function applyCameraState() {
  if (elements.cameraEnabled.checked) {
    await startCamera();
  } else {
    stopCamera();
  }
}

async function startCamera() {
  if (state.cameraStream) {
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    });

    elements.cameraPreview.srcObject = state.cameraStream;
    elements.cameraPreview.style.display = "block";
    elements.cameraFallback.style.display = "none";

    if (state.cameraIntervalId) {
      clearInterval(state.cameraIntervalId);
    }

    state.cameraIntervalId = window.setInterval(() => {
      if (state.bridgeReady && elements.cameraEnabled.checked) {
        sendVideoFrame();
      }
    }, 1500);
  } catch (error) {
    elements.cameraEnabled.checked = false;
    syncCameraToggleLabel();
    appendMessage("system", `カメラを開始できませんでした: ${error.message}`);
  }
}

function stopCamera() {
  if (state.cameraIntervalId) {
    clearInterval(state.cameraIntervalId);
    state.cameraIntervalId = null;
  }

  state.cameraStream?.getTracks().forEach((track) => track.stop());
  state.cameraStream = null;
  elements.cameraPreview.srcObject = null;
  elements.cameraPreview.style.display = "none";
  elements.cameraFallback.style.display = "grid";
}

function sendVideoFrame() {
  if (!state.cameraStream || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  const video = elements.cameraPreview;
  if (video.readyState < 2) {
    return;
  }

  const canvas = elements.captureCanvas;
  const width = video.videoWidth || 960;
  const height = video.videoHeight || 720;
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, width, height);

  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  const base64 = dataUrl.split(",")[1];
  sendSocketMessage({
    type: "video",
    data: base64,
    mimeType: "image/jpeg",
  });
}

async function applyMicrophoneState() {
  if (elements.micEnabled.checked) {
    await startMicrophone();
  } else {
    stopMicrophone();
  }
}

async function startMicrophone() {
  if (state.micStream) {
    return;
  }

  try {
    state.micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    });

    state.inputAudioContext = new AudioContext();
    await state.inputAudioContext.resume();

    state.inputSource = state.inputAudioContext.createMediaStreamSource(state.micStream);
    state.inputProcessor = state.inputAudioContext.createScriptProcessor(2048, 1, 1);
    const silenceGain = state.inputAudioContext.createGain();
    silenceGain.gain.value = 0;

    state.inputProcessor.onaudioprocess = (event) => {
      if (!state.bridgeReady || !elements.micEnabled.checked) {
        return;
      }

      const samples = event.inputBuffer.getChannelData(0);
      const pcm = floatTo16BitPCM(samples);
      sendSocketMessage({
        type: "audio",
        data: arrayBufferToBase64(pcm.buffer),
        sampleRate: state.inputAudioContext.sampleRate,
      });
    };

    state.inputSource.connect(state.inputProcessor);
    state.inputProcessor.connect(silenceGain);
    silenceGain.connect(state.inputAudioContext.destination);
  } catch (error) {
    elements.micEnabled.checked = false;
    appendMessage("system", `マイクを開始できませんでした: ${error.message}`);
  }
}

function stopMicrophone() {
  state.inputProcessor?.disconnect();
  state.inputSource?.disconnect();
  state.inputAudioContext?.close();
  state.micStream?.getTracks().forEach((track) => track.stop());

  state.inputProcessor = null;
  state.inputSource = null;
  state.inputAudioContext = null;
  state.micStream = null;

  if (state.bridgeReady) {
    sendSocketMessage({ type: "audio_stream_end" });
  }
}

async function sendTextMessage() {
  const text = elements.textInput.value.trim();
  if (!text || !state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  appendMessage("user", text);
  sendSocketMessage({ type: "text", text });
  elements.textInput.value = "";
}

function sendSocketMessage(payload) {
  if (state.socket?.readyState === WebSocket.OPEN) {
    state.socket.send(JSON.stringify(payload));
  }
}

async function ensureOutputAudioContext() {
  if (!state.outputAudioContext) {
    state.outputAudioContext = new AudioContext({ sampleRate: 24000 });
  }

  if (state.outputAudioContext.state !== "running") {
    await state.outputAudioContext.resume();
  }
}

async function playModelAudio(base64Data, mimeType = "audio/pcm;rate=24000") {
  await ensureOutputAudioContext();

  const sampleRateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = sampleRateMatch ? Number(sampleRateMatch[1]) : 24000;
  const pcmBytes = base64ToUint8Array(base64Data);
  const pcmView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
  const float32 = new Float32Array(pcmBytes.byteLength / 2);

  for (let index = 0; index < float32.length; index += 1) {
    float32[index] = pcmView.getInt16(index * 2, true) / 32768;
  }

  const audioBuffer = state.outputAudioContext.createBuffer(1, float32.length, sampleRate);
  audioBuffer.copyToChannel(float32, 0);

  const source = state.outputAudioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(state.outputAudioContext.destination);

  const startAt = Math.max(state.outputAudioContext.currentTime, state.playbackTime);
  state.playbackTime = startAt + audioBuffer.duration;
  state.activeSources.add(source);

  source.onended = () => {
    state.activeSources.delete(source);
  };

  source.start(startAt);
}

function clearPlaybackQueue() {
  for (const source of state.activeSources) {
    try {
      source.stop();
    } catch {
      // Ignore stopped nodes.
    }
  }

  state.activeSources.clear();
  if (state.outputAudioContext) {
    state.playbackTime = state.outputAudioContext.currentTime;
  } else {
    state.playbackTime = 0;
  }
}

function appendMessage(role, text) {
  const item = document.createElement("article");
  item.className = `message ${role}`;

  const label = document.createElement("strong");
  label.textContent =
    role === "model" ? "Nene" : role === "user" ? "You" : "System";

  const body = document.createElement("div");
  body.textContent = text;

  item.append(label, body);
  elements.transcriptList.prepend(item);
}

function upsertTranscript(role, text) {
  if (!text) {
    return;
  }

  appendMessage(role, text);
}

function setStatus(text, tone) {
  elements.statusText.textContent = text;
  elements.statusDot.className = `status-dot ${tone}`;
}

function syncCameraToggleLabel() {
  elements.cameraToggle.textContent = elements.cameraEnabled.checked ? "CAMERA ON" : "CAMERA OFF";
}

async function requestWakeLock() {
  if (!("wakeLock" in navigator) || state.wakeLock) {
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    state.wakeLock.addEventListener("release", () => {
      state.wakeLock = null;
    });
  } catch {
    appendMessage("system", "Wake Lock API は利用できませんでした。画面が自動で消える可能性があります。");
  }
}

async function releaseWakeLock() {
  if (state.wakeLock) {
    await state.wakeLock.release();
    state.wakeLock = null;
  }
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);

  for (let index = 0; index < float32Array.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, float32Array[index]));
    view.setInt16(index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }

  return new Int16Array(buffer);
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
