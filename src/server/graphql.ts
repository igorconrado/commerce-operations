import { createSchema, createYoga } from "graphql-yoga";
import { GraphQLError, visit, type ValidationRule } from "graphql";
import { depthLimit } from "@graphile/depth-limit";
import { authenticate, trustedOrigin } from "./identity";
import { catalog, listOrders, reserve } from "./orders";
import { transition } from "./lifecycle";
import { exceptions } from "./payments";
import { failedDeliveries, replay } from "./delivery";
import { DomainError, type Principal } from "../domain/reservations";
import { randomUUID } from "node:crypto";
export const typeDefs = /* GraphQL */ `
  type FailedDelivery {
    id: ID!
    orderId: ID!
    attempts: Int!
    error: String
  }
  type Viewer {
    id: ID!
    organizationId: ID!
    role: String!
  }
  type Variant {
    id: ID!
    sku: String!
    name: String!
    priceCents: Int!
    available: Int!
    version: Int!
  }
  type Order {
    id: ID!
    variantId: ID!
    quantity: Int!
    unitPriceCents: Int!
    status: String!
    version: Int!
  }
  type OrderConnection {
    nodes: [Order!]!
    hasNextPage: Boolean!
    endCursor: ID
  }
  input ReserveInput {
    variantId: ID!
    quantity: Int!
    key: String!
  }
  input TransitionInput {
    orderId: ID!
    expectedVersion: Int!
    action: String!
  }
  type OperationalException {
    id: ID!
    orderId: ID!
    reason: String!
  }
  type Query {
    failedDeliveries: [FailedDelivery!]!
    viewer: Viewer
    catalog: [Variant!]!
    orders(first: Int! = 20, after: ID): OrderConnection!
    exceptions: [OperationalException!]!
  }
  type Mutation {
    replay(id: ID!): Boolean!
    reserve(input: ReserveInput!): Order!
    transition(input: TransitionInput!): Order!
  }
`;
type Context = { principal: Principal | null };
export const yoga = createYoga({
  logging: false,
  graphqlEndpoint: "/api/graphql",
  graphiql: false,
  batching: false,
  cors: false,
  context: async ({ request }) => ({ principal: await authenticate(request) }),
  plugins: [
    {
      onValidate({
        addValidationRule,
      }: {
        addValidationRule: (rule: ValidationRule) => void;
      }) {
        addValidationRule(depthLimit({ maxDepth: 6, maxListDepth: 2 }));
        addValidationRule((context) => ({
          Document(node) {
            let fields = 0;
            visit(node, {
              Field() {
                fields++;
              },
            });
            if (fields > 80)
              context.reportError(new GraphQLError("QUERY_TOO_COMPLEX"));
          },
        }));
      },
    },
  ],
  maskedErrors: {
    maskError(error, message) {
      if (
        error instanceof GraphQLError &&
        error.originalError instanceof DomainError
      ) {
        return new GraphQLError(error.originalError.code, {
          extensions: { code: error.originalError.code },
        });
      }
      // Validation errors have no original exception and contain no database details.
      if (error instanceof GraphQLError && !error.originalError) return error;
      return new GraphQLError(message);
    },
  },
  schema: createSchema<Context>({
    typeDefs,
    resolvers: {
      Query: {
        failedDeliveries: (_parent, _args, ctx) =>
          failedDeliveries(ctx.principal),
        viewer: (_parent, _args, ctx) => ctx.principal,
        catalog: (_parent, _args, ctx) => catalog(ctx.principal),
        orders: (_parent, args, ctx) => listOrders(ctx.principal, args),
        exceptions: (_parent, _args, ctx) => exceptions(ctx.principal),
      },
      Mutation: {
        replay: (_parent, args, ctx) => replay(ctx.principal, args.id),
        reserve: (_parent, args, ctx) => reserve(ctx.principal, args.input),
        transition: (_parent, args, ctx) =>
          transition(ctx.principal, args.input),
      },
      Variant: { priceCents: (row) => row.price_cents },
      OperationalException: { orderId: (row) => row.order_id },
      FailedDelivery: {
        orderId: (row) => row.aggregate_id,
        error: (row) => row.last_error,
      },
      Order: {
        variantId: (row) => row.variant_id,
        unitPriceCents: (row) => row.unit_price_cents,
      },
    },
  }),
});
export async function graphqlRequest(request: Request) {
  if (!trustedOrigin(request))
    return Response.json({ error: "ORIGIN_DENIED" }, { status: 403 });
  if (
    !(request.headers.get("content-type") ?? "").startsWith("application/json")
  )
    return new Response(null, { status: 415 });
  const body = await request.text();
  if (Buffer.byteLength(body) > 16384)
    return new Response(null, { status: 413 });
  const id = randomUUID();
  const start = performance.now();
  const response = await yoga.fetch(
    new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body,
    }),
  );
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-request-id", id);
  console.info(
    JSON.stringify({
      event: "graphql.request",
      requestId: id,
      status: response.status,
      durationMs: performance.now() - start,
    }),
  );
  return response;
}
