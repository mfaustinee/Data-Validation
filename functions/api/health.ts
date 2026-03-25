export const onRequestGet: PagesFunction = async (context) => {
  const env = context.env as any;
  return new Response(JSON.stringify({ 
    status: "ok", 
    mode: "service-account",
    configured: !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY)
  }), {
    headers: { "Content-Type": "application/json" }
  });
};
