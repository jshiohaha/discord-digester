import { EnvConfig } from "../../env";

// Discord OAuth2 constants
const DISCORD_API = "https://discord.com/api/v10";
const OAUTH_ENDPOINT = `${DISCORD_API}/oauth2/authorize`;

/**
 * Generate the Discord OAuth2 authorization URL
 */
export const generateAuthUrl = () => {
    // https://discord.com/developers/docs/topics/oauth2
    const params = new URLSearchParams({
        client_id: EnvConfig.DISCORD_CLIENT_ID,
        redirect_uri: encodeURIComponent(EnvConfig.DISCORD_REDIRECT_URI),
        response_type: "code",
        integration_type: "0",
        scope: "bot",
        permissions: "66560",
    });

    return {
        url: `${OAUTH_ENDPOINT}?${params.toString()}`,
    };
};
