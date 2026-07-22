declare module "virtual:discussion-bridge/config" {
  const config: {
    provider: "discourse";
    preset: "astro" | "starlight";
    discourseUrl: string;
    siteUrl?: string;
    comments: {
      enabled: boolean;
      display: "simple" | "full" | "fullInteractive";
      embedHeight: string;
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
    embedHeight?: string;
    fullApp?: boolean;
  } & (
    | { discourseEmbedUrl: string; topicId?: never }
    | { discourseEmbedUrl?: never; topicId: number | string }
  );
}
