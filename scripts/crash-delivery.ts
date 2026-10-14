import { deliver } from "../src/server/delivery";
import { HttpPaymentGateway } from "../src/server/payment-gateway";
const gateway = new HttpPaymentGateway(
  process.env.SIMULATOR_URL!,
  process.env.SIMULATOR_SECRET!,
);
await deliver(process.argv[2], gateway, () => process.exit(86));
