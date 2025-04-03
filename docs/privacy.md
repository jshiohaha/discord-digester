# Privacy Policy

**Effective Date:** [Insert Effective Date]

This Privacy Policy explains how our Discord app ("the App") collects, uses, stores, and protects information from Discord servers where the App is installed. By using the App, you agree to the practices described below.

---

## 1. Information We Collect

### Message Data

-   **Content:** Full content of messages from allowed Discord channels.
-   **Metadata:**
    -   Message timestamps (createdAt)
    -   Message IDs and reply references
    -   Guild (server) IDs
    -   Channel IDs and Thread IDs

### User Data

-   **Author Information:**
    -   User IDs
    -   Other author details stored in JSON format

### Guild & Channel Data

-   **Guild Information:**
    -   Server names
    -   Server creation dates
    -   Server icon URLs
-   **Channel Information:**
    -   Channel names
    -   Channel types
    -   Public/private status

---

## 2. Purpose and Usage

The data collected is used solely for the following purposes:

-   **Indexing & Storage:**
    -   To index and store Discord messages for efficient search and retrieval.
    -   To track message history in channels and threads.
-   **Querying:**
    -   To enable users to query historical messages with filters (e.g., before/after specific timestamps, limits on results).
-   **Data Relationships:**
    -   To maintain relationships between messages, channels, and servers.
-   **Access Control:**
    -   To allow authorized access to message content through secure API endpoints.

---

## 3. Storage and Retention

-   **Database:**

    -   All data is stored in a PostgreSQL database (configured via the `DATABASE_URL` environment variable).
    -   The application uses Drizzle ORM for database interactions.
    -   The database is hosted on a cloud provider (likely Neon Database).

-   **Retention Policy:**
    -   Data is stored indefinitely; there are currently no automatic deletion or expiration policies in place.
    -   Stored information includes full message content along with associated metadata.

---

## 4. Data Sharing and Third Parties

-   **Data Sharing:**

    -   No explicit data sharing with third parties is performed.
    -   The only external interaction is with Discord’s API to fetch message and channel data.

-   **Third-Party Services:**
    -   User sessions are managed using secure cookies and stored server-side.
    -   Redis is referenced in configuration (likely for caching or rate limiting), but does not involve data sharing beyond internal use.

---

## 5. Security Measures

To protect your data, the App implements the following security measures:

-   **API Key Validation:**
    -   Protected endpoints require valid API keys.
-   **Authentication:**
    -   OAuth2 flow is used for Discord user authentication.
    -   JWT authentication is implemented for session management.
-   **Secure Data Transmission:**
    -   SSL is used for database connections.
-   **Session Management:**
    -   Sessions are managed with secure cookies.
-   **Additional Controls:**
    -   Error handling routines prevent accidental information leakage.
    -   Rate limiting capabilities (not currently active) are planned to mitigate abuse.

---

## 6. User Rights and Consent

-   **User Consent:**
    -   Users authenticate via Discord’s OAuth2, implicitly consenting to data collection as outlined in this Policy.
-   **Data Access & Deletion:**
    -   Although the App does not currently offer an interface for users to access or delete their data, users may submit requests for data access, updates, or deletion.
    -   Requests should be directed via our [GitHub repository](https://github.com/jshiohaha/discord-digester).

---

## 7. Legal and Regulatory Compliance

-   **Compliance Status:**

    -   The App does not include specific compliance features for GDPR, CCPA, or other privacy laws.
    -   Users from jurisdictions with specific privacy requirements should be aware that data is stored indefinitely and no region-specific handling is implemented at this time.

-   **User Responsibility:**
    -   By using the App, you acknowledge that it may not fully meet all legal requirements for data protection in every jurisdiction.

---

## 8. Third-Party Integrations

-   **Discord API:**
    -   The App’s primary external integration is with Discord’s API for fetching and interacting with message data.
-   **Hosting Providers:**
    -   Data storage is managed via a cloud provider (e.g., Neon Database).
-   **Caching & Rate Limiting:**
    -   Redis is referenced for internal use, such as caching or rate limiting.

---

## 9. Contact Information

For support, privacy-related inquiries, or to submit requests regarding your personal data, please open an issue on our [GitHub repository](https://github.com/jshiohaha/discord-digester).

---

## 10. Updates to This Privacy Policy

We may update this Privacy Policy from time to time. Changes will be reflected on this page and users will be notified of significant updates via our GitHub repository and within the App where applicable.
