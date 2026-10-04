"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Task 1 shell: create or join a room, then go to its beat diagnostic. Scenes come in Task 3. */
export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  function join(e: FormEvent) {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) router.push(`/diag/${encodeURIComponent(c)}`);
  }

  return (
    <main>
      <h1>Last Stand Protocol</h1>
      <p className="sub">Task 1 — beat engine diagnostic. Every phone in a crew opens the same room code.</p>
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
