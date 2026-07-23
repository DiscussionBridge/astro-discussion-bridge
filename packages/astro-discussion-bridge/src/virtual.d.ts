declare module "virtual:discussion-bridge/config" {
  const config: {
    provider: "discourse";
    preset: "astro" | "starlight";
    discourseUrl: string;
    siteUrl?: string;
    connections: {
      requireExplicit: boolean;
      jobs: import("./targets.js").DiscussionConnectionJobs;
    };
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
      renderMermaid: boolean;
      showLikes: boolean;
      refreshOnPageLoad: boolean;
    };
  };

  export default config;
}

interface Window {
  DiscourseEmbed?: {
    className?: string;
    discourseUrl: string;
    embedHeight?: string;
    fullApp?: boolean;
  } & (
    | { discourseEmbedUrl: string; topicId?: never }
    | { discourseEmbedUrl?: never; topicId: number | string }
  );
}
