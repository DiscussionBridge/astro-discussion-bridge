declare module "virtual:discussion-bridge/config" {
  const config: {
    provider: "discourse";
    preset: "astro" | "astro-content" | "starlight" | "mdx-inline" | "cloudflare-worker";
    discourseUrl: string;
    siteUrl?: string;
    comments: {
      enabled: boolean;
      display: "simple" | "full";
      className?: string;
    };
    replies: {
      enabled: boolean;
      minScore: number;
      maxReplies: number;
      refreshEndpoint?: string;
      showLikes: boolean;
      refreshOnPageLoad: boolean;
    };
  };

  export default config;
}

interface Window {
  DiscourseEmbed?: {
    discourseUrl: string;
    discourseEmbedUrl: string;
  };
}
