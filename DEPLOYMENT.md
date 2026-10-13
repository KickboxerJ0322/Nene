# GitHub and Cloud Run Setup

This project is prepared for `GitHub Actions -> Google Cloud Run` deployment.

## Target

- GitHub repository: `https://github.com/KickboxerJ0322/Nene.git`
- Google Cloud project: `jumpeicloud`
- Region: `asia-northeast1`
- Artifact Registry repository: `nene`
- Cloud Run service: `nene`

## Required GitHub Actions secrets

- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT`

## Required Google Cloud setup

Enable:

- Cloud Run Admin API
- Artifact Registry API
- Cloud Build API
- IAM Credentials API
- Security Token Service API

Create Artifact Registry:

```bash
gcloud artifacts repositories create nene \
  --repository-format=docker \
  --location=asia-northeast1 \
  --description="Nene images"
```

Create deployer service account:

```bash
gcloud iam service-accounts create github-deployer \
  --display-name="GitHub Deployer"
```

Grant roles:

- `roles/run.admin`
- `roles/artifactregistry.writer`
- `roles/iam.serviceAccountUser`
- `roles/cloudbuild.builds.editor`

Store Gemini API key in Secret Manager:

```bash
printf "YOUR_GEMINI_API_KEY" | gcloud secrets create GEMINI_API_KEY --data-file=-
```

Or add a new version:

```bash
printf "YOUR_GEMINI_API_KEY" | gcloud secrets versions add GEMINI_API_KEY --data-file=-
```

## First git push

```bash
git init
git branch -M main
git remote add origin https://github.com/KickboxerJ0322/Nene.git
git add .
git commit -m "Initial Nene app"
git push -u origin main
```

If `origin` already exists:

```bash
git remote set-url origin https://github.com/KickboxerJ0322/Nene.git
```

## 利用制限用のFirestore設定

サービス全体で日本時間の1日10回まで利用できるよう、Firestoreに利用枠を保存します。以下はプロジェクト管理者が初回に実行する設定です。

1. Firestore APIを有効にします。

```bash
gcloud services enable firestore.googleapis.com --project=jumpeicloud
```

2. 既存のデータベースを確認します。

```bash
gcloud firestore databases describe --database='(default)' --project=jumpeicloud
```

`(default)`がない場合だけ、Nativeモードのデータベースを作成します。すでにあるデータベースを削除・作り直す必要はありません。

```bash
gcloud firestore databases create --database='(default)' --location=asia-northeast1 --type=firestore-native --project=jumpeicloud
```

3. Cloud Runの実行用サービスアカウントを確認します。

```bash
gcloud run services describe nene --region=asia-northeast1 --project=jumpeicloud --format='value(spec.template.spec.serviceAccountName)'
```

4. 確認したメールアドレスにFirestoreへのアクセス権限を付与します。`実行用サービスアカウントのメールアドレス`を実際の値に置き換えてください。

```bash
gcloud projects add-iam-policy-binding jumpeicloud --member='serviceAccount:実行用サービスアカウントのメールアドレス' --role=roles/datastore.user
```

アプリは実行用サービスアカウントの認証情報を自動利用するため、認証キーのファイルは不要です。GitHub Actionsは`GOOGLE_CLOUD_PROJECT`を配備時に設定します。

`nene_usage_slots`に日付と枠番号を組み合わせたドキュメントを最大10個作成します。同じ枠の重複作成はFirestoreが拒否するので、同時起動や複数インスタンスでも上限を超えません。保存するのは受付時刻だけで、会話内容は含みません。過去の利用枠は自動削除しません。必要に応じて運営者が過去日分を整理してください。当日のドキュメントを削除すると回数制限をリセットしてしまうため、削除しないでください。

Firestoreの設定不備や障害時は、新規のAI接続を開始しません。1回の接続は利用枠の受付後から最大3分で、サーバーがAI接続を終了します。
