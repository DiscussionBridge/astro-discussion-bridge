interface PagesFunctionContext {
  params: {
    topicId?: string;
  };
}

const discourseUrl = "https://forum.discussionbridge.dev";

export async function onRequestGet(context: PagesFunctionContext) {
  const topicId = context.params.topicId;

  if (!topicId || !/^\d+$/.test(topicId)) {
    return Response.json({ error: "Invalid topic ID." }, { status: 400 });
  }

  const response = await fetch(`${discourseUrl}/t/${topicId}.json`, {
    headers: {
      Accept: "application/json",
    },
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": response.headers.get("Content-Type") ?? "application/json; charset=utf-8",
    },
  });
}
