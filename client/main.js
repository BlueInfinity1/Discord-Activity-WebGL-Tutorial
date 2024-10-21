import { DiscordSDK } from '@discord/embedded-app-sdk';

let unityInstance;
let auth;

// MAIN.JS: Check if we are running inside Discord
const urlParams = new URLSearchParams(window.location.search);
const isDiscordEnvironment = urlParams.has('frame_id');
console.log("MAIN.JS: Discord environment detected:", isDiscordEnvironment);

// MAIN.JS: Initialize Discord SDK if inside Discord
if (isDiscordEnvironment) {
    console.log("MAIN.JS: Initializing Discord SDK...");
    const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
    setupDiscordSdk(discordSdk)
        .then(authData => {
            console.log("MAIN.JS: Discord SDK setup successful:", authData);
            initializeUnityInstance(authData); // Initialize Unity after Discord authentication
        })
        .catch(err => {
            console.error("MAIN.JS: Failed to set up Discord SDK:", err);
            initializeUnityInstance(null); // Initialize Unity without Discord if there's an error
        });
} else {
    console.log("MAIN.JS: Running outside Discord environment. Discord SDK skipped.");
    initializeUnityInstance(null);
}

// MAIN.JS: Initialize Unity instance
function initializeUnityInstance(authData) {
    console.log("MAIN.JS: Initializing Unity instance...");
    
    // MAIN.JS: Conditionally set URLs based on the environment
    let buildUrl, streamingAssetsUrl;
    if (isDiscordEnvironment) {
        buildUrl = "/.proxy/Build";
        streamingAssetsUrl = "/.proxy/StreamingAssets";
        console.log("MAIN.JS: Using '/.proxy/' for URLs in Discord environment.");
    } else {
        buildUrl = "Build";
        streamingAssetsUrl = "StreamingAssets";
        console.log("MAIN.JS: Using standard URLs outside Discord environment.");
    }

    const loaderUrl = `${buildUrl}/Oct 20th.loader.js`;
    const config = {
        dataUrl: `${buildUrl}/Oct 20th.data`,
        frameworkUrl: `${buildUrl}/Oct 20th.framework.js`,
        codeUrl: `${buildUrl}/Oct 20th.wasm`,
        streamingAssetsUrl,
        companyName: "SuperSocialLabs",
        productName: "Meow Wars",
        productVersion: "1.0",
    };

    const canvas = document.querySelector("#gameCanvas");
    const loadingBar = document.querySelector("#loadingBlock");
    const progressBarFull = document.querySelector("#fullBar");

    console.log("MAIN.JS: Loading Unity WebGL...");

    const script = document.createElement("script");
    script.src = loaderUrl;
    script.onload = () => {
        createUnityInstance(canvas, config, progress => {
            console.log("MAIN.JS: Unity loading progress:", progress * 100 + "%");
            progressBarFull.style.width = 100 * progress + "%";
        }).then(instance => {
            unityInstance = instance;
            console.log("MAIN.JS: Unity instance successfully created.");

            // MAIN.JS: Send Discord login data to Unity
            if (authData) {
                console.log("MAIN.JS: Sending Discord login data to Unity:", authData);
                unityInstance.SendMessage("DiscordLoginDataHandler", "SetDiscordLoginData", JSON.stringify(authData));
            }

            loadingBar.style.display = "none"; // Hide loading bar after Unity is ready
        }).catch(message => {
            console.error("MAIN.JS: Unity instance initialization failed:", message);
        });
    };
    document.body.appendChild(script);
}

// MAIN.JS: Setup Discord SDK function
async function setupDiscordSdk(discordSdk) {
    console.log("MAIN.JS: Waiting for Discord SDK to be ready...");
    await discordSdk.ready();

    console.log("MAIN.JS: Authorizing with Discord...");
    const { code } = await discordSdk.commands.authorize({
        client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
        response_type: "code",
        state: "",
        prompt: "none",
        scope: ["identify", "guilds", "guilds.members.read"],
    });

    console.log("MAIN.JS: Received Discord authorization code:", code);

    const response = await fetch("/.proxy/api/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });

    const { access_token } = await response.json();
    console.log("MAIN.JS: Received access token:", access_token);

    auth = await discordSdk.commands.authenticate({ access_token });
    if (!auth) {
        throw new Error("MAIN.JS: Authentication with Discord failed.");
    }

    console.log("MAIN.JS: Authenticated with Discord:", auth);

    const member = await fetch(`https://discord.com/api/v10/users/@me/guilds/${discordSdk.guildId}/member`, {
        headers: {
            Authorization: `Bearer ${auth.access_token}`,
            "Content-Type": "application/json",
        },
    }).then(response => response.json());

    const username = member?.nick ?? auth.user.global_name;
    const iconUrl = member?.avatar
        ? `https://cdn.discordapp.com/guilds/${discordSdk.guildId}/users/${auth.user.id}/avatars/${member.avatar}.png?size=256`
        : `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=256`;

    console.log("MAIN.JS: User authenticated as:", username, "with avatar URL:", iconUrl);

    return { username, iconUrl, accessToken: access_token };
}
