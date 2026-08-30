declare module "virtual:discussion-bridge/config" {
  const config: {
    discourseUrl: string;
    comments: {
      enabled: boolean;
      display: "simple" | "full" | "fullInteractive";
      embedHeight: string;
      dynamicHeight: boolean;
      embedMinHeight: string;
      className?: string;
      credit: {
        enabled: boolean;
        prefix: string;
        label: string;
        href: string;
      };
    };
  };
  export default config;
}

declare global {
  interface Window {
    DiscourseEmbed?: {
      discourseUrl: string;
      discourseEmbedUrl?: string;
      topicId?: number;
      className?: string;
      fullApp?: true;
      embedHeight?: string;
      dynamicHeight?: boolean;
      embedMinHeight?: string;
    };
  }
}

export {};
