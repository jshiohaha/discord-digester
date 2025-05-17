<div align="center">
  </br>
  <p>
    <img height="300" src="./assets/cover.png" />
  </p>
  <p>
    <strong>discord digester</strong>
  </p>
</div>

# Motivation

Discord communities generate a wealth of discussions, decisions, and feedback, but that valuable information often remains locked in chat logs, making it hard to search, analyze, and integrate with other systems. Discord Digester helps teams, researchers, and community managers unlock these insights by capturing and organizing messages at scale.

Having comprehensive, well-organized conversation data is crucial because:

-   Teams need historical context to inform product roadmaps and feature prioritization.
-   Organizations gain deeper customer insights by analyzing sentiment trends and recurring topics.
-   Community managers can monitor health metrics, detect emerging issues, and surface key discussions.
-   Researchers and data scientists can build dashboards, reports, and machine learning models to drive data-driven decisions.

## What can you build with this data?

-   **Automated summaries & reports:** Generate concise recaps of long discussions or weekly highlights.
-   **Sentiment & topic analysis:** Track how user sentiment and subject matter evolve over time.
-   **AI-powered assistants:** Build chatbots that answer questions based on historical conversations.
-   **Real-time alerts:** Notify your team of trending keywords or spikes in activity.
-   **Knowledge bases & FAQs:** Populate documentation or support articles from past community Q\&A.

# Problem

Today, valuable conversation history is locked away in Discord. While channels are public, it’s cumbersome to search through threads or leverage advanced analytics tools on raw chat logs. This limits your ability to derive actionable insights and integrate community feedback into your workflows.

# Solution

Discord Digester extracts, stores, and makes Discord content easily accessible and analyzable. It systematically captures messages from specific channels and provides a simple API for querying and analyzing the data.

### Features

-   **Sync public Discord channels** to a PostgreSQL database (private or role-restricted channels are not accessible).
-   **Manage an allowlist** of channels to control which conversations are ingested.
-   **Backfill historical messages** to capture past context.
-   **Query messages** by channel, date range, author, or keyword.

# Stats

Explore some [data insights](./stats/README.md) powered by Discord Digester’s collected messages.

# API Reference

If you’d like to dive in right away, here are a few key endpoints:

-   **List allowed channels**

    ```
    GET /api/v1/channels/allowed
    ```

    Returns channels configured for message syncing.

-   **Get messages from a channel**

    ```
    GET /api/v1/messages/:channelId?limit=10&sort=desc
    ```

    Retrieves the most recent messages from an allowed channel.

All protected endpoints require an API key in the header:

```
Authorization: Bearer <YOUR_API_KEY>
```

The API is hosted at:

```
https://discord-digester-production.up.railway.app
```

For a quick-start, import the provided Yaak configuration at `./.yaak/yaak.discord-digester.json` into your API client.

## Authentication

Include your API key in requests to protected endpoints:

```
Authorization: Bearer <YOUR_API_KEY>
```

## Endpoints Overview

### Messages

-   **GET /api/v1/messages/\*\*\*\*:channelId**

    -   **Query Parameters:**

        -   `before` / `after` (timestamp or ISO 8601)
        -   `limit` (default: 100)
        -   `sort` (`asc` or `desc`, default: `desc`)

-   **POST /api/v1/messages/backfill** (API key required)

    -   Backfills historical messages for a channel/thread.

### Channels

-   **GET /api/v1/channels/allowed**
-   **GET /api/v1/channels** (all synced channels)
-   **GET /api/v1/channels/guild** (requires API key)
-   **POST /api/v1/channels/sync** (requires API key)
-   **POST /api/v1/channels/allowed** (add to allowlist)
-   **DELETE /api/v1/channels/allowed** (remove from allowlist)

### Health Check

-   **GET /health** — Verify the service is running.

# Getting Started

### Installation

```bash
npm install
```

### Building the project

**Without Docker:**

```bash
npm run build
```

**With Docker:**

```bash
docker build -t discord-digester .
```

### Running the server

**Without Docker:**

```bash
npm run dev
```

**With Docker:**

```bash
docker run -p 3000:3000 \
    -e PORT=3000 \
    -e DATABASE_URL=<DATABASE_URL> \
    -e NODE_ENV=<NODE_ENV> \
    -e LOG_LEVEL=<LOG_LEVEL> \
    discord-digester
```

## License

Discord Digester is licensed under [Apache 2.0](./LICENSE).

Unless you explicitly state otherwise, any contribution intentionally submitted for inclusion in Discord Digester by you, as defined in the Apache-2.0 license, shall be licensed as above, without any additional terms or conditions.
