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
      dynamicHeight: boolean;
      embedMinHeight: string;
      embedMaxHeight: string;
      embedViewportMaxHeight: string;
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
    relationships: {
      enabled: boolean;
    };
  };

  export default config;
}

declare module "virtual:discussion-bridge/relationships" {
  const manifest: import("./relationships.js").ContentRelationshipManifest;
  export default manifest;
}

interface Window {
  DiscourseEmbed?: {
    className?: string;
    discourseUrl: string;
    embedHeight?: string;
    dynamicHeight?: boolean;
    embedMinHeight?: string;
    embedMaxHeight?: string;
    embedViewportMaxHeight?: string;
    fullApp?: boolean;
  } & (
    | { discourseEmbedUrl: string; topicId?: never }
    | { discourseEmbedUrl?: never; topicId: number | string }
  );
}
