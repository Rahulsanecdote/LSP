"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** The shell: create or join a room by code, then pick a role. The beat diagnostic is linked from the room page. */
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function join(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/r/${encodeURIComponent(c)}`);
  }

  return (
    <main>
      <h1>Last Stand Protocol</h1>
      <p className="sub">Episode 1 — Descent. Every phone in a crew opens the same room code and takes a seat.</p>
      <form className="row" onSubmit={join}>
        <input
          aria-label="Room code"
          placeholder="Room code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          autoCapitalize="characters"
          autoCorrect="off"
          maxLength={12}
          style={{ flex: 1, minWidth: 140, textTransform: "uppercase" }}
        />
        <button className="primary" type="submit" disabled={!code.trim()}>
          Join
        </button>
        <button className="secondary" type="button" onClick={() => router.push(`/diag/${randomCode()}`)}>
          New room
        </button>
      </form>
    </main>
  );
}
