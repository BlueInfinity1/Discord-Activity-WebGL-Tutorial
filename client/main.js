let unityInstance;
let auth;

// Check if we are running inside Discord by looking for the 'frame_id' parameter in the URL
const urlParams = new URLSearchParams(window.location.search);
const isDiscordEnvironment = urlParams.has('frame_id'); // 'frame_id' is passed when the app runs in Discord

if (isDiscordEnvironment) {
   // If running inside Discord, initialize the Discord SDK
   import("@discord/embedded-app-sdk").then(({ DiscordSDK }) => {
      const discordSdk = new DiscordSDK(import.meta.env.VITE_DISCORD_CLIENT_ID);
      setupDiscordSdk(discordSdk);
   }).catch((err) => {
      console.error("Failed to load Discord SDK:", err);
   });
} else {
   // If not running in Discord, log that Discord SDK will not be initialized
   console.log("Running outside Discord environment. Discord SDK initialization skipped.");
}

// Function to initialize the Unity instance
createUnityInstance(document.querySelector("#unity-canvas"), {
   dataUrl: "Build/Web.data.gz",
   frameworkUrl: "Build/Web.framework.js.gz",
   codeUrl: "Build/Web.wasm.gz",
   streamingAssetsUrl: "StreamingAssets",
   companyName: "DefaultCompany",
   productName: "Unity Webgl Activity",
   productVersion: "1.0",
   matchWebGLToCanvasSize: false,
}).then(async (instance) => {
   unityInstance = instance;

   if (isDiscordEnvironment) {
      const member = await fetch(`https://discord.com/api/v10/users/@me/guilds/${discordSdk.guildId}/member`, {
         headers: {
            Authorization: `Bearer ${auth.access_token}`,
            'Content-Type': 'application/json',
         },
      }).then(response => response.json());

      let username = member?.nick ?? auth.user.global_name;
      let iconUrl = member?.avatar 
         ? `https://cdn.discordapp.com/guilds/${discordSdk.guildId}/users/${auth.user.id}/avatars/${member.avatar}.png?size=${256}`
         : `https://cdn.discordapp.com/avatars/${auth.user.id}/${auth.user.avatar}.png?size=${256}`;

      if (unityInstance) {
         unityInstance.SendMessage("Bridge", "SetUserData", JSON.stringify({
            "username": username,
            "iconUrl": iconUrl,
         }));
      }
   }
});

// Setup Discord SDK function
async function setupDiscordSdk(discordSdk) {
   await discordSdk.ready();

   // Authorize with Discord Client
   const { code } = await discordSdk.commands.authorize({
      client_id: import.meta.env.VITE_DISCORD_CLIENT_ID,
      response_type: "code",
      state: "",
      prompt: "none",
      scope: [
         "identify",
         "guilds",
         "guilds.members.read"
      ],
   });

   console.log("Authorization Code:", code);

   // Retrieve an access_token from your activity's server
   const response = await fetch("/server/token", {
      method: "POST",
      headers: {
         "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
   });

   const { access_token } = await response.json();

   // Authenticate with Discord client (using the access_token)
   auth = await discordSdk.commands.authenticate({ access_token });

   if (auth == null) {
      throw new Error("Authentication with Discord failed.");
   }

   console.log("Authenticated with Discord");
}
