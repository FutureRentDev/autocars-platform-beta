import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { money } from "@autocars/core";
import { api, useLoad } from "./lib";
import { ErrorBox, Eyebrow, Loading } from "./components";
export async function startHostedCheckout(purpose: unknown) {
  const checkout = await api.post("/payments/checkout", purpose);
  if (
    ![
      "https://www.payfast.co.za/eng/process",
      "https://sandbox.payfast.co.za/eng/process",
    ].includes(checkout.action)
  )
    throw new Error("Unexpected checkout provider.");
  const form = document.createElement("form");
  form.method = "POST";
  form.action = checkout.action;
  for (const [name, value] of Object.entries(checkout.fields)) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
export function PaymentReturn() {
  const [params] = useSearchParams();
  const id = params.get("id");
  const { data, error, loading, reload } = useLoad<{ payment: any }>(
    `/payments/${encodeURIComponent(id || "missing")}`,
    { payment: null },
  );
  useEffect(() => {
    if (!data.payment || data.payment.status !== "pending") return;
    const timer = setInterval(() => void reload(), 5000);
    return () => clearInterval(timer);
  }, [data.payment?.status, id]);
  return (
    <div className="wrap page account-page">
      <Eyebrow>YOUR ADVERTISEMENT</Eyebrow>
      <h1>
        {data.payment?.status === "paid"
          ? "Payment verified."
          : params.has("cancelled")
            ? "Checkout interrupted."
            : "Confirming your payment."}
      </h1>
      {loading && !data.payment ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} />
      ) : (
        data.payment && (
          <div className="panel">
            <h3>
              {money(data.payment.amount)} · {data.payment.status}
            </h3>
            <p>
              {data.payment.status === "paid"
                ? data.payment.error ||
                  "Your advertisement payment has been verified. New listings go to the AutoCars review queue before publication."
                : data.payment.status === "failed"
                  ? "The payment provider has reported that this payment was not completed."
                  : "We are waiting for confirmation from the payment provider. Returning to this page does not confirm a payment."}
            </p>
            <div className="button-row">
              <Link className="button dark" to="/workspace">
                Open my workspace
              </Link>
              <button className="button outline" onClick={() => void reload()}>
                Check status
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
