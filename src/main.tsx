import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", height: "100vh", gap: "12px",
          background: "oklch(14% 0.01 240)", color: "oklch(93% 0.008 240)",
          fontFamily: "system-ui, sans-serif", padding: "24px", textAlign: "center",
        }}>
          <div style={{ fontSize: "32px" }}>⚠</div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>Something went wrong</div>
          <div style={{ fontSize: "12px", color: "oklch(45% 0.015 240)", maxWidth: "480px", lineHeight: 1.6 }}>
            {this.state.error.message}
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              marginTop: "8px", padding: "8px 20px", borderRadius: "8px",
              border: "1px solid oklch(40% 0.12 145)", background: "oklch(22% 0.06 145)",
              color: "oklch(60% 0.18 145)", fontSize: "13px", fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}
          >Reload app</button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
