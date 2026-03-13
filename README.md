# AES Note

A secure, serverless encrypted note storage service built on Cloudflare Workers with AES-GCM encryption.

## Features

- **AES-GCM Encryption**: All notes are encrypted using AES-GCM with SHA-256 derived keys
- **Auto-expiring**: Notes automatically expire after 7 days
- **Password Protection**: Use your own password or let the system generate a random one
- **Zero-knowledge**: Encryption happens on the server, passwords are never stored
- **Simple Web UI**: Built-in interface for easy note management

## API Endpoints

### `POST /save`
Save a new encrypted note.

**Request Body:**
```json
{
  "content": "Your secret text here",
  "password": "optional-password"
}
```

**Response:**
```json
{
  "id": "uuid",
  "password": "used-password",
  "isGenerated": true,
  "success": true
}
```

### `GET /get/:id?password=xxx`
Retrieve and decrypt a note.

**Parameters:**
- `id`: The note UUID
- `password`: The password used during encryption

## Deployment

1. Install dependencies:
```bash
npm install
```

2. Configure `wrangler.toml` with your KV namespace ID

3. Deploy to Cloudflare Workers:
```bash
npx wrangler deploy
```

## Tech Stack

- Cloudflare Workers
- Cloudflare KV
- TypeScript
- Web Crypto API

## License

ISC
