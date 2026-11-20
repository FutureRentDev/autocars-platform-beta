import { PaymentReturn } from "./checkout";
import { PwaUpdate } from "./pwa";
import { brand } from "@autocars/core";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { Provider } from "./lib";
import { Layout, NotificationChat, InboxPage } from "./components";
import { Home, Browse, Detail, Finance, Compare, Garage, Legal } from "./pages";
import { Account, Sell, Workspace } from "./workspace";
import "./style.css";
function Scroll() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
document.documentElement.style.setProperty("--ink", brand.primary);
document.documentElement.style.setProperty("--paper", brand.background);
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Provider>
        <Scroll />
        <PwaUpdate />
        <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/cars" element={<Browse />} />
            <Route path="/cars/:id" element={<Detail />} />
            <Route path="/chat/:leadId" element={<NotificationChat />} />
            <Route path="/inbox" element={<InboxPage />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/compare" element={<Compare />} />
            <Route path="/garage" element={<Garage />} />
            <Route path="/payment" element={<PaymentReturn />} />
            <Route path="/account" element={<Account />} />
            <Route path="/sell" element={<Sell />} />
            <Route path="/sell/:id" element={<Sell />} />
            <Route path="/workspace" element={<Workspace />} />
            <Route path="/privacy" element={<Legal />} />
            <Route
              path="*"
              element={
                <div className="wrap page">
                  <h1>That road ends here.</h1>
                  <a className="button dark" href="/">
                    Back to {brand.name}
                  </a>
                </div>
              }
            />
          </Routes>
        </Layout>
      </Provider>
    </BrowserRouter>
  </React.StrictMode>,
);
