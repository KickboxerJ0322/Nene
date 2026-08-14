# Nene

Nene は、古い Android スマートフォンを使って動かす、カメラ付きリアルタイムAI会話Webアプリです。  
この実装は `Node.js + Express + WebSocket + Vanilla JavaScript` で構成され、Gemini Live API をサーバー側から中継します。

## できること

- 背面カメラのプレビュー表示
- マイク音声を Gemini Live API へリアルタイム送信
- Gemini の音声応答をブラウザで再生
- ユーザー音声と Nene 音声の文字起こし表示
- 定期的なカメラフレーム送信による簡易ビジュアル会話
- Google Search を使った最新情報の補強を切り替え可能
- Android 端末向けの Wake Lock 対応

## セットアップ

1. 依存関係を入れます。

```bash
npm install
```

2. `.env.example` を元に `.env` を作成し、Gemini API キーを設定します。

```env
PORT=3000
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.1-flash-live-preview
VOICE_NAME=Kore
ENABLE_GOOGLE_SEARCH=true
```

3. 開発サーバーを起動します。

```bash
npm run dev
```

または

```bash
npm start
```

4. 同じネットワーク上の Android Chrome から `http://<PCのIPアドレス>:3000` にアクセスします。

## 使い方

1. `Neneを起動` を押す
2. カメラとマイクの権限を許可する
3. そのまま話しかける
4. 必要ならテキスト入力でも質問する

## 注意点

- Gemini Live API はプレビュー機能です。
- ブラウザのカメラ/マイク利用には HTTPS か `localhost` が必要な場合があります。
- 旧 Android 端末では音声処理負荷が高いことがあるため、必要に応じてカメラを OFF にしてください。
- 現在の実装は、連続動画ではなく JPEG フレームを約 1.5 秒ごとに送る構成です。

## 主なファイル

- `server.js`: Express と WebSocket の中継サーバー
- `public/index.html`: UI
- `public/style.css`: 画面デザイン
- `public/app.js`: カメラ、マイク、再生、WebSocket 制御

## 参考にした公式仕様

- Gemini Live API SDK guide: https://ai.google.dev/gemini-api/docs/live-api/get-started-sdk
- Gemini Live API capabilities guide: https://ai.google.dev/gemini-api/docs/live-api/capabilities
- Gemini Live API tools guide: https://ai.google.dev/gemini-api/docs/live-api/tools
