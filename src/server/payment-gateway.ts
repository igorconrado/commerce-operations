import { paymentEvent } from "./payments";
export type Charge = {
  key: string;
  orderId: string;
  organizationId: string;
  amountCents: number;
};
export interface PaymentGateway {
  charge(input: Charge): Promise<unknown>;
  lookup(key: string): Promise<unknown | null>;
}
export class HttpPaymentGateway implements PaymentGateway {
  constructor(
    private base: string,
    private secret: string,
    private timeoutMs = 2000,
  ) {}
  async request(path: string, body?: unknown) {
    const response = await fetch(`${this.base}${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        authorization: `Bearer ${this.secret}`,
        "content-type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("PROVIDER_UNAVAILABLE");
    return paymentEvent.parse(await response.json());
  }
  charge(input: Charge) {
    return this.request("/charges", input);
  }
  lookup(key: string) {
    return this.request(`/charges/${key}`);
  }
}
