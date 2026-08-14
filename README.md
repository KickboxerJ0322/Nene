# Nene

Nene は、古いスマートフォンをカメラ付き会話AIに変えるためのリアルタイム Web アプリです。
現在の構成は `Node.js + Express + WebSocket + Vanilla JavaScript` で、Gemini Live API をサーバー側から中継しています。

## 現在の主な機能

- 音声会話のリアルタイム接続
- ユーザー音声と Nene 音声の Transcript 表示
- テキスト入力での会話
- カメラ ON/OFF の切り替え
- フロントカメラ / 背面カメラの切り替え
- Google Search 利用の ON/OFF
- Voice の選択
- Nene が発声中に左上ロゴがアニメーション
- スマホ表示を意識したシンプルな UI
- Wake Lock による画面スリープ抑制

## 現在の UI 仕様

- Session / Camera / Transcript の順で表示
- Transcript はデフォルトで非表示
- カメラはデフォルトで OFF
- カメラの向きはデフォルトでフロントカメラ
- Voice のデフォルトは `Sulafat`
- ロゴとファビコンは `public/nene-logo.png`

## 技術構成

- サーバー: `server.js`
- フロントエンド: `public/index.html`, `public/style.css`, `public/app.js`
- 音声・会話: Gemini Live API
- 配備先: Google Cloud Run
- 連携: GitHub push -> GitHub Actions -> Cloud Run deploy

## ローカル起動

1. 依存関係をインストールします。

```bash
npm install
```

2. `.env.example` をもとに `.env` を作成します。

```env
PORT=3000
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.1-flash-live-preview
VOICE_NAME=Sulafat
ENABLE_GOOGLE_SEARCH=true
```

3. 開発サーバーを起動します。

```bash
npm run dev
```

本番相当で試す場合は次でも起動できます。

```bash
npm start
```

4. ブラウザで `http://localhost:3000` を開きます。

## 使い方

1. `Neneを起動` を押す
2. 必要なら `マイクを使う` `カメラを使う` を切り替える
3. スマホでは `カメラの向き` でフロント / 背面を選ぶ
4. そのまま話しかける
5. 必要ならテキスト入力でも話しかける
6. Transcript を見たいときは `Transcriptを表示` を押す

## Cloud Run 運用メモ

このリポジトリは GitHub と Cloud Run を連携して運用しています。
`main` ブランチへ push すると、GitHub Actions から Cloud Run へデプロイされます。

想定している設定:

- GitHub repository: `KickboxerJ0322/Nene`
- Google Cloud project: `jumpeicloud`
- Cloud Run service: `nene`
- Region: `asia-northeast1`

## 環境変数

- `GEMINI_API_KEY`: Gemini API キー
- `GEMINI_MODEL`: 使用する Live API モデル名
- `VOICE_NAME`: デフォルト voice 名。現在の既定値は `Sulafat`
- `ENABLE_GOOGLE_SEARCH`: `true` なら Google Search を有効化
- `PORT`: ローカル起動ポート

## 確認コマンド

```bash
npm run check
```

`server.js` と `public/app.js` の構文チェックを行います。

## 主なファイル

- `server.js`: Gemini Live API との中継サーバー
- `public/index.html`: UI のマークアップ
- `public/style.css`: レイアウトとデザイン
- `public/app.js`: カメラ、音声入出力、UI 制御
- `.github/workflows/deploy-cloud-run.yml`: Cloud Run 自動デプロイ設定

## 注意点

- Gemini Live API は仕様変更される可能性があります。
- モバイルブラウザではカメラ / マイク利用時に HTTPS が必要になる場合があります。
- 古い端末では、カメラ ON と音声会話を同時に使うと負荷が上がることがあります。
- 現在の映像送信は連続動画ではなく、一定間隔の JPEG フレーム送信です。
