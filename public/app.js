const VOICE_OPTIONS = [
  ["Kore", "\u30b3\u30ec\u30fc - \u3057\u3063\u304b\u308a"],
  ["Puck", "\u30d1\u30c3\u30af - \u5143\u6c17"],
  ["Zephyr", "\u30bc\u30d5\u30a1\u30fc - \u660e\u308b\u3044"],
  ["Charon", "\u30ab\u30ed\u30f3 - \u8aac\u660e\u4e0a\u624b"],
  ["Fenrir", "\u30d5\u30a7\u30f3\u30ea\u30eb - \u3044\u304d\u3044\u304d"],
  ["Leda", "\u30ec\u30c0 - \u82e5\u3005\u3057\u3044"],
  ["Orus", "\u30aa\u30eb\u30b9 - \u843d\u3061\u7740\u304d"],
  ["Aoede", "\u30a2\u30aa\u30a8\u30c7 - \u8efd\u3084\u304b"],
  ["Callirrhoe", "\u30ab\u30ea\u30ed\u30a8 - \u89aa\u3057\u307f\u3084\u3059\u3044"],
  ["Autonoe", "\u30a2\u30a6\u30c8\u30ce\u30a8 - \u3055\u308f\u3084\u304b"],
  ["Enceladus", "\u30a8\u30f3\u30b1\u30e9\u30c9\u30a5\u30b9 - \u6c17\u3065\u304b\u3044"],
  ["Iapetus", "\u30a4\u30a2\u30da\u30c8\u30b9 - \u30af\u30ea\u30a2"],
  ["Umbriel", "\u30a2\u30f3\u30d6\u30ea\u30a8\u30eb - \u3084\u308f\u3089\u304b\u3044"],
  ["Algieba", "\u30a2\u30eb\u30ae\u30a8\u30d0 - \u306a\u3081\u3089\u304b"],
  ["Despina", "\u30c7\u30b9\u30d4\u30ca - \u7a4f\u3084\u304b"],
  ["Erinome", "\u30a8\u30ea\u30ce\u30e1 - \u306f\u3063\u304d\u308a"],
  ["Algenib", "\u30a2\u30eb\u30b2\u30cb\u30d6 - \u4f4e\u3081"],
  ["Rasalgethi", "\u30e9\u30b5\u30eb\u30b2\u30c6\u30a3 - \u6848\u5185\u5411\u304d"],
  ["Laomedeia", "\u30e9\u30aa\u30e1\u30c7\u30a3\u30a2 - \u5feb\u6d3b"],
  ["Achernar", "\u30a2\u30b1\u30eb\u30ca\u30eb - \u3084\u3055\u3057\u3044"],
  ["Alnilam", "\u30a2\u30eb\u30cb\u30e9\u30e0 - \u5802\u3005"],
  ["Schedar", "\u30b7\u30a7\u30c0\u30eb - \u5b89\u5b9a\u611f"],
  ["Gacrux", "\u30ac\u30af\u30eb\u30c3\u30af\u30b9 - \u5927\u4eba\u3063\u307d\u3044"],
  ["Pulcherrima", "\u30d7\u30eb\u30b1\u30ea\u30de - \u524d\u5411\u304d"],
  ["Achird", "\u30a2\u30ad\u30eb\u30c9 - \u30d5\u30ec\u30f3\u30c9\u30ea\u30fc"],
  ["Zubenelgenubi", "\u30ba\u30d9\u30cd\u30eb\u30b2\u30cc\u30d3 - \u30ab\u30b8\u30e5\u30a2\u30eb"],
  ["Vindemiatrix", "\u30f4\u30a3\u30f3\u30c7\u30df\u30a2\u30c8\u30ea\u30af\u30b9 - \u304a\u3060\u3084\u304b"],
  ["Sadachbia", "\u30b5\u30c0\u30af\u30d3\u30a2 - \u306b\u304e\u3084\u304b"],
  ["Sadaltager", "\u30b5\u30c0\u30eb\u30bf\u30b2\u30eb - \u77e5\u7684"],
  ["Sulafat", "\u30b9\u30e9\u30d5\u30a1\u30c8 - \u3042\u305f\u305f\u304b\u3044"],
];

const LOGO_POWER_ON_MS = 480;
const LOGO_POWER_OFF_MS = 320;

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
  transcriptVisible: false,
  settingsVisible: false,
  logoVisible: false,
  logoTimeoutId: null,
};

const elements = {
  connectButton: document.querySelector("#connectButton"),
  disconnectButton: document.querySelector("#disconnectButton"),
  cameraEnabled: document.querySelector("#cameraEnabled"),
  cameraFacingMode: document.querySelector("#cameraFacingMode"),
  micEnabled: document.querySelector("#micEnabled"),
  searchEnabled: document.querySelector("#searchEnabled"),
  voiceName: document.querySelector("#voiceName"),
  textForm: document.querySelector("#textForm"),
  textInput: document.querySelector("#textInput"),
  transcriptList: document.querySelector("#transcriptList"),
  transcriptPanel: document.querySelector("#transcriptPanel"),
  transcriptToggle: document.querySelector("#transcriptToggle"),
  settingsToggle: document.querySelector("#settingsToggle"),
  settingsPanel: document.querySelector("#settingsPanel"),
  sessionLogoStage: document.querySelector("#sessionLogoStage"),
  cameraPreview: document.querySelector("#cameraPreview"),
  cameraFallback: document.querySelector("#cameraFallback"),
  captureCanvas: document.querySelector("#captureCanvas"),
  statusText: document.querySelector("#statusText"),
  statusDot: document.querySelector("#statusDot"),
  tokenCounter: document.querySelector("#tokenCounter"),
  modelBadge: document.querySelector("#modelBadge"),
  cameraStateBadge: document.querySelector("#cameraStateBadge"),
};

boot().catch((error) => {
  setStatus(`\u521d\u671f\u5316\u30a8\u30e9\u30fc: ${error.message}`, "error");
  appendMessage("system", `\u521d\u671f\u5316\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ${error.message}`);
});

async function boot() {
  const response = await fetch("/api/config");
  state.config = await response.json();

  buildVoiceOptions(state.config.defaultVoiceName || "Sulafat");
  elements.searchEnabled.checked = state.config.defaultGoogleSearch ?? true;
  elements.modelBadge.textContent = state.config.model || "Gemini Live";
  elements.cameraFacingMode.value = "user";

  if (!state.config.hasGeminiKey) {
    appendMessage("system", "`.env` \u306b `GEMINI_API_KEY` \u3092\u5165\u308c\u308b\u3068\u97f3\u58f0\u4f1a\u8a71\u3092\u958b\u59cb\u3067\u304d\u307e\u3059\u3002");
    setStatus("API\u30ad\u30fc\u672a\u8a2d\u5b9a", "error");
  } else {
    appendMessage("system", "Nene\u306e\u6e96\u5099\u304c\u3067\u304d\u3066\u3044\u307e\u3059\u3002\u8d77\u52d5\u30dc\u30bf\u30f3\u304b\u3089\u30bb\u30c3\u30b7\u30e7\u30f3\u3092\u59cb\u3081\u3066\u304f\u3060\u3055\u3044\u3002");
  }

  elements.connectButton.addEventListener("click", () => {
    void startSession();
  });

  elements.disconnectButton.addEventListener("click", () => {
    void stopSession("\u30e6\u30fc\u30b6\u30fc\u304c\u7d42\u4e86\u3057\u307e\u3057\u305f\u3002");
  });

  elements.cameraEnabled.addEventListener("change", () => {
    syncCameraStateBadge();
    void applyCameraState();
  });

  elements.cameraFacingMode.addEventListener("change", () => {
    void handleCameraFacingModeChange();
  });

  elements.micEnabled.addEventListener("change", () => {
    void applyMicrophoneState();
  });

  elements.textForm.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendTextMessage();
  });

  elements.transcriptToggle.addEventListener("click", () => {
    state.transcriptVisible = !state.transcriptVisible;
    syncTranscriptPanel();
  });

  elements.settingsToggle.addEventListener("click", () => {
    state.settingsVisible = !state.settingsVisible;
    syncSettingsPanel();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.sessionLive) {
      void requestWakeLock();
    }
  });

  syncCameraStateBadge();
  syncTranscriptPanel();
  syncSettingsPanel();
  syncSessionLogoSpeakingState();
}

function buildVoiceOptions(defaultVoiceName) {
  elements.voiceName.innerHTML = "";

  for (const [value, label] of VOICE_OPTIONS) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    elements.voiceName.append(option);
  }

  if (!VOICE_OPTIONS.some(([value]) => value === defaultVoiceName)) {
    const option = document.createElement("option");
    option.value = defaultVoiceName;
    option.textContent = `${defaultVoiceName} - \u30ab\u30b9\u30bf\u30e0`;
    elements.voiceName.prepend(option);
  }

  elements.voiceName.value = defaultVoiceName;
}

async function startSession() {
  if (state.sessionLive) {
    return;
  }

  setStatus("\u8d77\u52d5\u4e2d...", "idle");
  elements.connectButton.disabled = true;
  powerOnSessionLogo();

  try {
    await ensureOutputAudioContext();
    await applyCameraState();
    await applyMicrophoneState();
    await requestWakeLock();
    openSocket();
  } catch (error) {
    setStatus(`\u8d77\u52d5\u5931\u6557: ${error.message}`, "error");
    elements.connectButton.disabled = false;
    powerOffSessionLogo();
  }
}

function openSocket() {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const socket = new WebSocket(`${protocol}://${location.host}/ws`);
  state.socket = socket;

  socket.addEventListener("open", () => {
    state.sessionLive = true;
    state.logoVisible = true;
    setStatus("Nene\u306b\u63a5\u7d9a\u3057\u3066\u3044\u307e\u3059...", "idle");
    elements.disconnectButton.disabled = false;
    appendMessage("system", "Gemini Live \u30bb\u30c3\u30b7\u30e7\u30f3\u3092\u958b\u59cb\u3057\u3066\u3044\u307e\u3059\u3002");
    setSessionLogoActive(true);

    sendSocketMessage({
      type: "start_session",
      cameraEnabled: elements.cameraEnabled.checked,
      micEnabled: elements.micEnabled.checked,
      googleSearchEnabled: elements.searchEnabled.checked,
      voiceName: elements.voiceName.value,
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
    setStatus("WebSocket\u63a5\u7d9a\u30a8\u30e9\u30fc", "error");
  });
}

function handleServerMessage(payload) {
  switch (payload.type) {
    case "session_ready":
      state.bridgeReady = true;
      setStatus("\u4f1a\u8a71\u3067\u304d\u307e\u3059", "live");
      appendMessage("system", `${payload.model} / Voice: ${payload.voiceName} \u3067\u6e96\u5099\u5b8c\u4e86\u3067\u3059\u3002`);
      break;
    case "transcript_user":
      upsertTranscript("user", payload.text);
      break;
    case "transcript_model":
    case "model_text":
      upsertTranscript("model", payload.text);
      break;
    case "model_audio":
      void playModelAudio(payload.data, payload.mimeType);
      break;
    case "audio_interrupt":
      clearPlaybackQueue();
      appendMessage("system", "\u30e6\u30fc\u30b6\u30fc\u306e\u5272\u308a\u8fbc\u307f\u3092\u691c\u77e5\u3057\u305f\u305f\u3081\u3001Nene\u306e\u97f3\u58f0\u518d\u751f\u3092\u4e2d\u65ad\u3057\u307e\u3057\u305f\u3002");
      break;
    case "usage":
      elements.tokenCounter.textContent = `Tokens: ${payload.totalTokenCount}`;
      break;
    case "session_closed":
      appendMessage("system", payload.reason || "\u30bb\u30c3\u30b7\u30e7\u30f3\u304c\u9589\u3058\u3089\u308c\u307e\u3057\u305f\u3002");
      break;
    case "server_error":
      appendMessage("system", payload.message);
      setStatus(payload.message, "error");
      break;
    case "turn_complete":
    case "pong":
      break;
    default:
      appendMessage("system", `\u672a\u51e6\u7406\u30a4\u30d9\u30f3\u30c8: ${payload.type}`);
  }
}

async function stopSession(reason = "\u30bb\u30c3\u30b7\u30e7\u30f3\u3092\u7d42\u4e86\u3057\u307e\u3057\u305f\u3002") {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    sendSocketMessage({ type: "stop_session" });
    state.socket.close();
  }

  powerOffSessionLogo();
  await releaseWakeLock();
  clearPlaybackQueue();
  cleanupSocketState();
  appendMessage("system", reason);
}

function cleanupSocketState() {
  const shouldPowerOffLogo =
    elements.sessionLogoStage.classList.contains("is-visible") &&
    !elements.sessionLogoStage.classList.contains("is-powering-off");

  state.bridgeReady = false;
  state.sessionLive = false;
  state.socket = null;
  elements.connectButton.disabled = false;
  elements.disconnectButton.disabled = true;
  setStatus("\u672a\u63a5\u7d9a", "idle");

  if (shouldPowerOffLogo) {
    powerOffSessionLogo();
  } else {
    syncSessionLogoSpeakingState();
  }
}

async function applyCameraState() {
  if (elements.cameraEnabled.checked) {
    await startCamera();
  } else {
    stopCamera();
  }
}

async function handleCameraFacingModeChange() {
  if (!state.cameraStream) {
    return;
  }

  stopCamera();
  if (elements.cameraEnabled.checked) {
    await startCamera();
  }
}

async function startCamera() {
  if (state.cameraStream) {
    syncCameraStateBadge();
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: elements.cameraFacingMode.value || "user" },
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

    syncCameraStateBadge();
  } catch (error) {
    elements.cameraEnabled.checked = false;
    syncCameraStateBadge();
    appendMessage("system", `\u30ab\u30e1\u30e9\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f: ${error.message}`);
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
  syncCameraStateBadge();
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
    appendMessage("system", `\u30de\u30a4\u30af\u3092\u958b\u59cb\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f: ${error.message}`);
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
  syncSessionLogoSpeakingState();

  source.onended = () => {
    state.activeSources.delete(source);
    syncSessionLogoSpeakingState();
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
  syncSessionLogoSpeakingState();

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
  label.textContent = role === "model" ? "Nene" : role === "user" ? "You" : "System";

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

function syncCameraStateBadge() {
  elements.cameraStateBadge.textContent = elements.cameraEnabled.checked ? "Camera On" : "Camera Off";
}

function syncTranscriptPanel() {
  elements.transcriptPanel.classList.toggle("is-hidden", !state.transcriptVisible);
  elements.transcriptToggle.textContent = state.transcriptVisible
    ? "Transcript\u3092\u975e\u8868\u793a"
    : "Transcript\u3092\u8868\u793a";
}

function syncSettingsPanel() {
  elements.settingsPanel.classList.toggle("is-hidden", !state.settingsVisible);
  elements.settingsToggle.setAttribute("aria-expanded", String(state.settingsVisible));
  elements.settingsToggle.textContent = state.settingsVisible
    ? "\u8a2d\u5b9a\u3092\u96a0\u3059"
    : "\u8a2d\u5b9a\u3092\u8868\u793a";
}

function powerOnSessionLogo() {
  clearLogoTimer();
  state.logoVisible = true;
  elements.sessionLogoStage.setAttribute("aria-hidden", "false");
  elements.sessionLogoStage.classList.remove("is-powering-off");
  elements.sessionLogoStage.classList.add("is-visible", "is-powering-on");

  requestAnimationFrame(() => {
    elements.sessionLogoStage.classList.add("is-active");
  });

  state.logoTimeoutId = window.setTimeout(() => {
    elements.sessionLogoStage.classList.remove("is-powering-on");
    syncSessionLogoSpeakingState();
  }, LOGO_POWER_ON_MS);
}

function powerOffSessionLogo() {
  clearLogoTimer();
  state.logoVisible = false;
  elements.sessionLogoStage.classList.remove("is-speaking", "is-powering-on", "is-active");
  elements.sessionLogoStage.classList.add("is-visible", "is-powering-off");

  state.logoTimeoutId = window.setTimeout(() => {
    elements.sessionLogoStage.classList.remove("is-visible", "is-powering-off");
    elements.sessionLogoStage.setAttribute("aria-hidden", "true");
  }, LOGO_POWER_OFF_MS);
}

function setSessionLogoActive(isActive) {
  state.logoVisible = isActive;
  elements.sessionLogoStage.classList.toggle("is-visible", isActive);
  elements.sessionLogoStage.classList.toggle("is-active", isActive);
  elements.sessionLogoStage.setAttribute("aria-hidden", String(!isActive));
  syncSessionLogoSpeakingState();
}

function syncSessionLogoSpeakingState() {
  const isSpeaking = state.logoVisible && state.activeSources.size > 0;
  elements.sessionLogoStage.classList.toggle("is-speaking", isSpeaking);
}

function clearLogoTimer() {
  if (state.logoTimeoutId) {
    clearTimeout(state.logoTimeoutId);
    state.logoTimeoutId = null;
  }
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
    appendMessage("system", "Wake Lock API \u306f\u5229\u7528\u3067\u304d\u307e\u305b\u3093\u3067\u3057\u305f\u3002\u753b\u9762\u304c\u81ea\u52d5\u3067\u6d88\u3048\u308b\u53ef\u80fd\u6027\u304c\u3042\u308a\u307e\u3059\u3002");
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