import { DomainError } from "../../../../domain/reservations";
import { receivePayment, verifyWebhook } from "../../../../server/payments";
export async function POST(request: Request) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret || secret.length < 32)
    return Response.json({ error: "NOT_CONFIGURED" }, { status: 503 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 4096)
    return new Response(null, { status: 413 });
  if (
    !verifyWebhook(
      body,
      request.headers.get("x-payment-timestamp") ?? "",
      request.headers.get("x-payment-signature") ?? "",
      secret,
    )
  )
    return Response.json({ error: "INVALID_SIGNATURE" }, { status: 401 });
  try {
    return Response.json({ result: await receivePayment(JSON.parse(body)) });
  } catch (error) {
    return Response.json(
      { error: error instanceof DomainError ? error.code : "INVALID_EVENT" },
      {
        status:
          error instanceof DomainError && error.code === "EVENT_CONFLICT"
            ? 409
            : 400,
      },
    );
  }
}
