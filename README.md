<div align="center">
  </br>
  <p>
    <img height="300" src="./assets/cover.jpg" />
  </p>
  <p>
    <strong>discord digester</strong>
  </p>
</div>

📹 Metadao hackathon demo [here](https://drive.google.com/file/d/1FhhMiLyX0gQEitR9TU9PpHvdE__zQYsk/view).

# Motivation

Futarchic markets are prediction markets used for governance decisions, where participants trade on the outcomes of different policy choices. These markets help organizations make better decisions by aggregating collective knowledge and creating financial incentives for accurate predictions.

Having comprehensive, well-organized information is crucial for futarchic markets because:

-   Traders need historical context and data to make informed predictions
-   Market efficiency depends on participants having access to relevant information
-   Complex governance decisions require understanding multiple interconnected factors
-   Information asymmetry can lead to market inefficiencies and poor outcomes

## What can be built with this data?

Metadao's Discord content can power various tools to enhance futarchic markets. Natural language processing can generate automated market summaries and highlight key discussion points. Historical analysis tools can track sentiment trends and correlate them with market outcomes. AI-powered research assistants can help traders quickly find relevant historical discussions and market precedents. Real-time analytics can detect emerging topics and potential market-moving discussions, enabling more informed trading decisions. This data infrastructure also enables the development of educational tools that help new participants understand market dynamics through concrete examples from past governance decisions.

# Problem

Today, conversations and context is locked away in Discord. Channels are public, but it's cumbersome to search through them to find the information you need. It's also impossible to leverage sophisticated tools like LLMs to analyze the data.

# Solution

Discord Digester is a tool that extracts, stores, and makes Discord content easily accessible and analyzable. It systematically captures messages from specific channels and allows you to easily query them.

### Features

-   Sync discord channels to a postgres database
-   Add and remove channels from an allowlist that dictates which messages are synced
-   Backfill messages from allowed channels
-   Get messages from a channel

# API Reference

📣 If you just want to get rolling and read later, here is an endpoint that will return the last 10 messages from propsosal 3

`https://discord-digester-production.up.railway.app/api/v1/messages/1199177850109046868?limit=10&sort=desc`

The Discord Digester API provides several endpoints to manage channels and retrieve messages. Some endpoints require API key authentication, which should be provided in the request headers.

The API is currently hosted on railway and is available at `https://discord-digester-production.up.railway.app`.

🛠️ I use an API client called [Yaak](https://yaak.app) to test APIs. I exported my workspace configuration [here](./.yaak/yaak.discord-digester.json). If you want to quickly get started with the API, you can import it into Yaak to get started. Make sure your environment is set to production, unless you have the service running locally.

## Authentication

Protected endpoints require an API key to be included in the request headers:

```
Authorization: Bearer <YOUR_API_KEY>
```

## Messages

### Get Messages from Channel

📔 This is the main endpoint that API consumers will likely care about. It allows users to retrieve messages from a specific allowlisted channel.

```
GET /api/v1/messages/:channelId
```

Retrieves messages from a specific channel. To see the channels that are in the allowlist, use the `GET /api/v1/channels/allowed` endpoint.

The query parameters allow you to filter the messages by date and limit the number of messages returned. If you want to fetch increasingly older messages from channel, you can keep updating the `before` parameter with the ID of the last message you received.

**Path Parameters:**

-   `channelId`: ID of the channel to retrieve messages from

**Query Parameters:**

-   `before` (optional): Filter messages before this time point. Accepts either:
    -   Epoch timestamp (milliseconds since Unix epoch)
    -   ISO 8601 date string (e.g., "2023-04-15T14:30:00Z")
-   `after` (optional): Filter messages after this time point. Accepts either:
    -   Epoch timestamp (milliseconds since Unix epoch)
    -   ISO 8601 date string (e.g., "2023-04-15T14:30:00Z")
-   `limit` (optional): Maximum number of messages to return (default: 100)
-   `sort` (optional): Sort direction, either "asc" or "desc" (default: "desc")

**Authentication:** Not required

**Response:**

```json
{
    "status": 200,
    "data": {
        "messages": [
            {
                "messageId": "123456789012345678",
                "channelId": "123456789012345678",
                "content": "Hello world!",
                "createdAt": "2023-01-01T00:00:00.000Z",
                "authorId": "123456789012345678",
                "authorUsername": "user123"
            }
        ]
    }
}
```

### Backfill Messages

```
POST /api/v1/messages/backfill
```

Backfills historical messages from a specified channel or thread.

**Authentication:** API key required

**Request Body:**

```json
{
    "channelId": "123456789012345678",
    "threadId": "987654321098765432", // Optional
    "threads": ["active", "archived"], // Optional, default: ["active", "archived"]
    "maxRetries": 3, // Optional, default: 3
    "before": "123456789012345678" // Optional, message ID to get messages before
}
```

**Response:**

```json
{
    "status": 200
}
```

## Channels

### List Allowed Channels

```
GET /api/v1/channels/allowed
```

Returns a list of channels that are on the allowlist for message syncing.

**Authentication:** Not required

**Response:**

```json
{
    "status": 200,
    "data": [
        {
            "channelId": "123456789012345678",
            "name": "general",
            "updatedAt": "2023-01-01T00:00:00.000Z",
            "isPublic": true,
            "allowed": true,
            "type": "text",
            "parentId": null
        }
    ]
}
```

### List All Channels

```
GET /api/v1/channels
```

Returns a list of all channels that have been synced to the database.

**Query Parameters:**

-   `name` (optional): Filter channels by name (case-insensitive, partial match)

**Authentication:** Not required

**Response:**

```json
{
    "status": 200,
    "data": [
        {
            "channelId": "123456789012345678",
            "name": "general",
            "updatedAt": "2023-01-01T00:00:00.000Z",
            "isPublic": true,
            "allowed": true,
            "type": "text",
            "parentId": null
        }
    ]
}
```

### List Guild Channels

```
GET /api/v1/channels/guild
```

Returns a list of all channels in the Discord guild that the bot has access to.

**Authentication:** API key required

**Response:**

```json
{
    "status": 200,
    "data": [
        {
            "id": "123456789012345678",
            "name": "general",
            "type": "GUILD_TEXT",
            "is_public": true
        }
    ]
}
```

### Sync Channels

```
POST /api/v1/channels/sync
```

Syncs all channels from the Discord guild to the database.

**Authentication:** API key required

**Response:**

```json
{
    "status": 200,
    "data": {
        "newChannelCount": 5
    }
}
```

### Add Channels to Allowlist

```
POST /api/v1/channels/allowed
```

Adds specified channels to the allowlist for message syncing.

**Authentication:** API key required

**Request Body:**

```json
{
    "ids": ["123456789012345678", "987654321098765432"]
}
```

**Response:**

```json
{
    "status": 201,
    "data": [
        {
            "channelId": "123456789012345678",
            "name": "general",
            "updatedAt": "2023-01-01T00:00:00.000Z",
            "isPublic": true,
            "allowed": true,
            "type": "text",
            "parentId": null
        }
    ]
}
```

### Remove Channels from Allowlist

```
DELETE /api/v1/channels/allowed
```

Removes specified channels from the allowlist.

**Authentication:** API key required

**Request Body:**

```json
{
    "ids": ["123456789012345678"]
}
```

**Response:**

```json
{
    "status": 200,
    "data": {
        "message": "Channels removed from allowlist"
    }
}
```

## Health Check

```
GET /health
```

Simple health check endpoint to verify the API is running. This endpoint is used during the deployment process to ensure the API is up and running.

**Authentication:** Not required

**Response:**

```json
{
    "status": "ok"
}
```

# Getting Started

### Installation

```bash
npm install
```

### Building the project

Without Docker:

```bash
npm run build
```

With Docker:

```bash
docker build -t discord-digester .
```

### Running the server

Without Docker:

```bash
npm run dev
```

With Docker:

```bash
docker run -p 3000:3000 \
    -e DATABASE_URL=<DATABASE_URL> \
    -e NODE_ENV=<NODE_ENV> \
    -e LOG_LEVEL=<LOG_LEVEL> \
    -e DISCORD_BOT_TOKEN=<DISCORD_BOT_TOKEN> \
    discord-digester
```
