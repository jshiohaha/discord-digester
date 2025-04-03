# Terms of Service

Last Updated: April 3, 2025

## 1. Acceptance of Terms

By accessing or using the Discord Digester (Discord Digester) service (“Service”), you agree to be bound by these Terms of Service (“Terms”). If you do not agree to these Terms, you must not access or use the Service.

## 2. Description of the Service

-   Discord Digester is a Discord message indexing/digester tool that:

-   Extracts, stores, and provides searchable access to Discord content from public channels.

-   Synchronizes public Discord channels to a PostgreSQL database.

-   Allows users to query historical and current messages through API endpoints.

-   Supports managing indexed channels via an allowlist and backfilling historical messages.

The Service does not access or index messages from restricted channels for which the bot lacks explicit permission.

## 3. Data Handling & Privacy

-   Data Collected: The Service collects Discord message content along with metadata such as message IDs, timestamps, channel IDs, guild IDs, author IDs, usernames, thread information, and related channel metadata.

-   Storage: Collected data is stored indefinitely in a PostgreSQL database unless explicitly deleted by an administrator.

-   Access: Indexed data is made available via API endpoints. Appropriate authentication (API keys) is required for administrative functions.

-   Privacy Policy: Use of the Service is also subject to our Privacy Policy (if applicable), which explains in detail how data is processed and protected.

## 4. User Responsibilities & Permissions

-   Proper Authorization: Users are responsible for ensuring that they have the necessary permissions to add the bot to their Discord servers and authorize the indexing of messages.

-   Compliance with Guidelines: Users must ensure that the use of the Service complies with Discord’s Community Guidelines and Terms of Service.

-   Appropriate Use: Users must not use the Service for any unauthorized or unlawful purpose, including indexing content that may infringe on the rights of others.

## 5. Compliance with Discord’s Policies

-   API Usage: The Service uses Discord’s official APIs and adheres to Discord’s rate limiting and permission frameworks.

-   Channel Permissions: The bot indexes only those channels for which it has the appropriate access rights, and it does not attempt to index restricted channels.

-   Third-Party Compliance: Users must ensure that their use of the indexed data does not conflict with Discord’s policies or any third-party rights.

## 6. Intellectual Property

-   User Content: The Service indexes and provides access to user-generated content on Discord; however, Discord Digester does not claim ownership of such content.

-   Service Ownership: The code, software, and associated intellectual property rights for the Service are provided under an open license. Users are free to use, modify, distribute, and repurpose the codebase without restriction. No specific ownership claims are made over the functionality or implementation of the Service.

## 7. Limitation of Liability & Disclaimers

-   Data Capture: While the Service employs retry mechanisms for API calls, it does not guarantee complete data capture or continuous availability.

-   No Warranties: The Service is provided “as is” without warranties of any kind, whether express or implied. Discord Digester disclaims all warranties regarding accuracy, reliability, or suitability of the Service.

-   Liability: In no event shall Jacob Shiohira be liable for any indirect, incidental, special, or consequential damages arising out of the use or inability to use the Service.

## 8. Jurisdiction & Governing Law

-   The governance and interpretation of these Terms will be in line with the laws of Delaware. By using the Service, you consent to the exclusive jurisdiction of the courts situated in Delaware for resolving any disputes connected to these Terms.

## 9. Modification & Termination

-   Modifications: We reserve the right to modify these Terms at any time. Updated Terms will be posted on this page with a revised “Last Updated” date.

-   Termination: We may terminate or suspend access to the Service, revoke API keys, or otherwise limit your use of the Service if you violate these Terms or for other operational reasons.

## 10. Payment & Subscription

Free and Open Source: The Service is fully open source, self-hostable, and free to use. There are no payment requirements for accessing the Service.

## 11. Support & Contact Information

For support or inquiries related to these Terms or the Service, please open an issue on our [GitHub repository](https://github.com/jshiohaha/discord-digester)
