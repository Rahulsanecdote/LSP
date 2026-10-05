"use client";

import { Component, type ReactNode } from "react";

/** A WebGL failure must not take the instrument's DOM state down with it. */
export class GlCanvasBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  override componentDidCatch(err: unknown): void {
    console.error("WebGL canvas failed", err);
  }
  override render(): ReactNode {
    if (this.state.failed) {
      return <div data-testid="gl-failed" style={{ position: "absolute", inset: 0, background: "#0e0f12", color: "#7e818b", display: "grid", placeItems: "center", fontSize: 13 }}>WebGL unavailable</div>;
    }
    return this.props.children;
  }
}
