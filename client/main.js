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

    const loaderUrl = `${buildUrl}/Meow Wars.loader.js`;
    const config = {
        dataUrl: `${buildUrl}/Meow Wars.data`,
        frameworkUrl: `${buildUrl}/Meow Wars.framework.js`,
        codeUrl: `${buildUrl}/Meow Wars.wasm`,
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
            //console.log("Unity loading progress:", progress * 100 + "%");
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

    // Exchange code for access token via your proxy endpoint
    const response = await fetch("/.proxy/aws/Authenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
    });

    const { access_token } = await response.json();
    console.log("MAIN.JS: Received access token:", access_token);

    // Fetch the user's global information (for global user ID and name)
    const userInfo = await fetch('https://discord.com/api/v10/users/@me', {
        headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
        },
    }).then(response => response.json());

    // Fetch the user's guilds to get the guild ID and name
    const guilds = await fetch('https://discord.com/api/v10/users/@me/guilds', {
        headers: {
            Authorization: `Bearer ${access_token}`,
            "Content-Type": "application/json",
        },
    }).then(response => response.json());

    // Check if we are in a guild or a private/group chat
    let guildId, guildName, member = null;
    const currentGuild = guilds.find(g => g.id === discordSdk.guildId);

    if (currentGuild) {
        // In a guild
        guildId = currentGuild.id;
        guildName = currentGuild.name;

        // Fetch the user's member data in the guild (for username in guild and avatar)
        member = await fetch(`https://discord.com/api/v10/users/@me/guilds/${guildId}/member`, {
            headers: {
                Authorization: `Bearer ${access_token}`,
                "Content-Type": "application/json",
            },
        }).then(response => response.json());

    } else {
        // In a private chat or group chat, use "u" + userId as the guildId and username as the guildName
        guildId = "u" + userInfo.id;
        guildName = userInfo.username;
    }

    // Correctly extract the username based on guild-specific nickname and global name
    const username = member?.nick ?? userInfo.global_name ?? userInfo.username;

    // Extract required data: user ID, username, guild ID, and nickname
    const userId = userInfo.id;

    // Print out the details
    console.log("User ID:", userId);
    console.log("Global Username:", userInfo.username);
    console.log("Guild ID:", guildId);
    console.log("Guild Name:", guildName);
    console.log("Username in Guild (Nickname):", username);

    return { userId, username, guildId, guildName };
}
