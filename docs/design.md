# Operations interface

The first slice serves a repeated task: inspect available stock, reserve an amount, verify the recorded order. The chosen composition pairs stock with the command and places the durable result below. SKU, units and historical prices carry more prominence than decorative metrics. A muted green ledger treatment distinguishes available stock from order status; native controls preserve keyboard behavior.

Considered alternatives: a full-width order table with a modal command (efficient for large queues, hides stock while reserving); a guided stepper (clear for occasional use, adds friction for a repeated two-field task). The side-by-side workspace is the initial reversible choice; on narrow screens it becomes stock → command → result. No user preference or user-study result is implied.

Sources read on 2026-10-14 (documentation only, interactions not tested):

- [Shopify Polaris](https://shopify.dev/docs/api/polaris): operational surfaces and consistent components; do not inherit Shopify branding or platform assumptions.
- [GOV.UK service design](https://www.gov.uk/service-manual/design): scope the transaction around the user's task; do not copy a government identity.
- [W3C form notifications](https://www.w3.org/WAI/tutorials/forms/notifications/): visible errors and announced results; preserve the draft when retrying.

Validation: automated desktop/mobile main-flow, focus, overflow and network-retry checks in `tests/e2e`; screenshot inspection is recorded separately in verification. No physical-device, screen-reader or full WCAG certification claim.
