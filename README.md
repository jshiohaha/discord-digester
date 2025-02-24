<div align="center">
  </br>
  <p>
    <img height="300" src="./assets/cover.jpg" />
  </p>
  <p>
    <strong>discord digester</strong>
  </p>
</div>

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

Discord Digester is a tool that allows you to digest and analyze Discord messages.

### Features

-   Sync discord channels to a postgres database
-   Add and remove channels from an allowlist that dictates which messages are synced
-   Backfill messages from allowed channels
-   Get messages from a channel

### Future work

-   Support for backfilling thread based channels
-   Use an archiver process to move completed conversations into a read-only archive, like arweave

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
