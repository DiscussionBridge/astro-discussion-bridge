declare module "virtual:discussion-bridge/config" {
  const config: {
    provider: "discourse";
    preset: "astro" | "astro-content" | "starlight" | "mdx-inline" | "cloudflare-worker";
    discourseUrl: string;
    siteUrl?: string;
    comments: {
      enabled: boolean;
      className?: string;
    };
    replies: {
      enabled: boolean;
      minScore: number;
      maxReplies: number;
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
