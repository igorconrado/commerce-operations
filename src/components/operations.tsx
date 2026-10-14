"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
type Variant = {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  available: number;
};
type Order = {
  id: string;
  quantity: number;
  unitPriceCents: number;
  status: string;
  version: number;
};
type Snapshot = {
  viewer: { role: string; organizationId: string } | null;
  catalog: Variant[];
  exceptions: { id: string; orderId: string; reason: string }[];
  orders: { nodes: Order[]; hasNextPage: boolean; endCursor: string | null };
};
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const query = `query Snapshot($after:ID){viewer{role organizationId} catalog{id sku name priceCents available} orders(first:20,after:$after){nodes{id quantity unitPriceCents status version} hasNextPage endCursor} exceptions{id orderId reason}}`;
async function graphql<T>(query: string, variables: object = {}): Promise<T> {
  const response = await fetch("/api/graphql", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const result = await response.json();
  if (!response.ok || result.errors)
    throw new Error(result.errors?.[0]?.extensions?.code ?? "REQUEST_FAILED");
  return result.data;
}
const messages: Record<string, string> = {
  VERSION_CONFLICT: "Este pedido mudou. Atualize os dados antes de decidir.",
  RESERVATION_EXPIRED: "Esta reserva já venceu. Atualize os dados.",
  INVALID_TRANSITION: "O pedido já foi encerrado.",
  STOCK_UNAVAILABLE:
    "Estoque insuficiente. Atualize os dados e ajuste a quantidade.",
  IDEMPOTENCY_CONFLICT:
    "Esta tentativa já foi usada com outros dados. Atualize a página.",
  FORBIDDEN: "Seu perfil permite apenas consultar a operação.",
  UNAUTHENTICATED: "Sua sessão expirou. Entre novamente.",
};
export function Operations() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [email, setEmail] = useState("operator@aurora.test");
  const [password, setPassword] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [variantId, setVariantId] = useState("");
  const [attempt, setAttempt] = useState<{
    key: string;
    variantId: string;
    quantity: number;
  } | null>(null);
  const refresh = useCallback(async (after?: string | null) => {
    const next = await graphql<Snapshot>(query, { after });
    setData((previous) =>
      after && previous
        ? {
            ...next,
            orders: {
              ...next.orders,
              nodes: [...previous.orders.nodes, ...next.orders.nodes],
            },
          }
        : next,
    );
    setVariantId((current) => current || next.catalog[0]?.id || "");
  }, []);
  useEffect(() => {
    let active = true;
    graphql<Snapshot>(query)
      .then((next) => {
        if (active) {
          setData(next);
          setVariantId(next.catalog[0]?.id ?? "");
        }
      })
      .catch((e: Error) => {
        if (active && e.message !== "UNAUTHENTICATED")
          setError("Não foi possível carregar a operação. Tente novamente.");
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  async function login(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error("Confira seu e-mail e senha.");
      setPassword("");
      await refresh();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Falha ao entrar. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reserve(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    const input = attempt ?? { key: crypto.randomUUID(), variantId, quantity };
    setAttempt(input);
    try {
      const result = await graphql<{ reserve: Order }>(
        "mutation Reserve($input:ReserveInput!){reserve(input:$input){id quantity unitPriceCents status}}",
        { input },
      );
      setAttempt(null);
      setNotice(
        `Reserva ${result.reserve.id.slice(0, 8)} registrada. ${result.reserve.quantity} unidade(s).`,
      );
      await refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : "REQUEST_FAILED";
      if (messages[code]) setAttempt(null);
      setError(
        messages[code] ??
          "Não foi possível confirmar o resultado. Tente novamente: a mesma tentativa será consultada com segurança.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function reload(after?: string | null) {
    setBusy(true);
    setError("");
    try {
      await refresh(after);
    } catch {
      setError("Não foi possível atualizar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  async function changeOrder(order: Order, action: "confirm" | "cancel") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await graphql(
        "mutation Transition($input:TransitionInput!){transition(input:$input){id status version}}",
        {
          input: { orderId: order.id, expectedVersion: order.version, action },
        },
      );
      setNotice(
        action === "confirm"
          ? "Pedido confirmado."
          : "Reserva cancelada e estoque liberado.",
      );
      await refresh();
    } catch (e) {
      const code = e instanceof Error ? e.message : "";
      setError(
        messages[code] ??
          "Resultado não confirmado. Atualize os dados antes de tentar novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      const r = await fetch("/api/session", { method: "DELETE" });
      if (!r.ok) throw new Error();
      setData(null);
      setAttempt(null);
      setNotice("");
    } catch {
      setError("Não foi possível sair. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="shell">
      <header>
        <Link
          className="brand"
          href="/"
          aria-label="Commerce Operations, início"
        >
          <span className="brand-mark">CO</span>
          <span>
            Commerce <strong>Operations</strong>
          </span>
        </Link>
        <span className="environment">Ambiente demonstrativo</span>
        {data?.viewer && (
          <button className="quiet" disabled={busy} onClick={logout}>
            Sair
          </button>
        )}
      </header>
      <main id="main">
        <div className="heading">
          <p className="eyebrow">CONTROLE DE OPERAÇÕES / 01</p>
          <h1>
            Estoque comprometido.
            <br />
            <span>Operação sob controle.</span>
          </h1>
          <p>
            Reserve produtos e acompanhe cada pedido, do saldo disponível ao
            registro da operação.
          </p>
        </div>
        {!loaded ? (
          <p role="status">Carregando sua operação…</p>
        ) : !data?.viewer ? (
          <section className="login panel">
            <div>
              <p className="eyebrow">ACESSO À OPERAÇÃO</p>
              <h2>Entre no seu espaço</h2>
              <p>Use uma conta sintética configurada na instalação local.</p>
            </div>
            <form onSubmit={login}>
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <label htmlFor="password">Senha</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button disabled={busy}>
                {busy ? "Entrando…" : "Entrar na operação →"}
              </button>
            </form>
          </section>
        ) : (
          <>
            <div className="workspace-bar">
              <div>
                <span className="dot" />{" "}
                {data.viewer.organizationId ===
                "10000000-0000-4000-8000-000000000002"
                  ? "Cedro Goods"
                  : "Aurora Supply"}{" "}
                <span className="muted">/ Depósito principal</span>
              </div>
              <button
                className="quiet"
                disabled={busy}
                onClick={() => reload()}
              >
                Atualizar dados ↻
              </button>
            </div>
            <div className="operation-grid">
              <section className="panel stock">
                <p className="eyebrow">01 / DISPONIBILIDADE</p>
                <h2>Catálogo de estoque</h2>
                <p className="muted">
                  O saldo considera as reservas já registradas.
                </p>
                {data.catalog.length === 0 ? (
                  <p>Nenhum produto disponível neste catálogo.</p>
                ) : (
                  data.catalog.map((v) => (
                    <article className="stock-row" key={v.id}>
                      <div>
                        <span className="sku">{v.sku}</span>
                        <h3>{v.name}</h3>
                        <p>{money(v.priceCents)} / unidade</p>
                      </div>
                      <div className="stock-number">
                        <strong>{v.available}</strong>
                        <span>disponíveis</span>
                      </div>
                    </article>
                  ))
                )}
              </section>
              <section className="panel reservation">
                <p className="eyebrow">02 / NOVA RESERVA</p>
                <h2>Comprometer estoque</h2>
                {data.viewer.role === "viewer" ? (
                  <p>Seu acesso permite consultar pedidos e estoque.</p>
                ) : (
                  <form onSubmit={reserve}>
                    <label htmlFor="variant">Produto</label>
                    <select
                      id="variant"
                      required
                      disabled={busy || !!attempt}
                      value={variantId}
                      onChange={(e) => setVariantId(e.target.value)}
                    >
                      {data.catalog.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                    <label htmlFor="quantity">Quantidade</label>
                    <input
                      id="quantity"
                      type="number"
                      required
                      min={1}
                      max={100}
                      disabled={busy || !!attempt}
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value))}
                    />
                    <p className="muted">
                      O preço é preservado no pedido no momento da reserva.
                    </p>
                    <button disabled={busy || !variantId}>
                      {busy
                        ? "Registrando…"
                        : attempt
                          ? "Consultar tentativa anterior"
                          : "Registrar reserva →"}
                    </button>
                  </form>
                )}
              </section>
            </div>
            <section className="panel orders">
              <div className="section-title">
                <div>
                  <p className="eyebrow">03 / ACOMPANHAMENTO</p>
                  <h2>Pedidos registrados</h2>
                </div>
                <span className="count">
                  {data.orders.nodes.length} exibidos
                </span>
              </div>
              {data.orders.nodes.length === 0 ? (
                <div className="empty">
                  <h3>Sua próxima reserva começa aqui.</h3>
                  <p>
                    Escolha um produto e uma quantidade para registrar o
                    primeiro pedido.
                  </p>
                </div>
              ) : (
                <div className="table-wrap">
                  <table>
                    <caption className="sr-only">
                      Pedidos da organização atual
                    </caption>
                    <thead>
                      <tr>
                        <th>Pedido</th>
                        <th>Quantidade</th>
                        <th>Total</th>
                        <th>Situação e ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.orders.nodes.map((o) => (
                        <tr key={o.id}>
                          <td className="mono">{o.id.slice(0, 8)}</td>
                          <td>{o.quantity} un.</td>
                          <td>{money(o.quantity * o.unitPriceCents)}</td>
                          <td>
                            <span className="status">
                              {
                                (
                                  {
                                    reserved: "Reservado",
                                    confirmed: "Confirmado",
                                    cancelled: "Cancelado",
                                    expired: "Expirado",
                                  } as Record<string, string>
                                )[o.status]
                              }
                            </span>
                            {o.status === "reserved" &&
                              data.viewer?.role === "operator" && (
                                <div className="order-actions">
                                  <button
                                    className="quiet"
                                    disabled={busy}
                                    onClick={() => changeOrder(o, "confirm")}
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    className="quiet"
                                    disabled={busy}
                                    onClick={() => changeOrder(o, "cancel")}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {data.orders.hasNextPage && (
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => reload(data.orders.endCursor)}
                >
                  Carregar mais pedidos
                </button>
              )}
            </section>
            {data.exceptions.length > 0 && (
              <section className="panel exceptions">
                <p className="eyebrow">EXCEÇÕES OPERACIONAIS</p>
                <h2>Precisam de revisão</h2>
                <ul>
                  {data.exceptions.map((item) => (
                    <li key={item.id}>
                      Pedido {item.orderId.slice(0, 8)}:{" "}
                      {item.reason === "payment_after_release"
                        ? "Pagamento recebido após liberação do estoque."
                        : "Estado conflitante informado pelo pagamento."}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
        <div aria-live="polite">
          {notice && <p className="notice">{notice}</p>}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <footer>
          Commerce Operations{" "}
          <span>Dados sintéticos · Nenhum pagamento real</span>
        </footer>
      </main>
    </div>
  );
}
