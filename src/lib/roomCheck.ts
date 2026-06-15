// Pre-join existence probe for IMPOSTOR rooms.
//
// The room DO is only registered in `active_rooms` once someone has actually
// joined (the DO calls writeActiveRoom on first WS join). So a never-created,
// expired, or mistyped code returns 404 from /api/room/<code> — letting the
// lobby reject the join with a real "room not found" message instead of
// silently minting a brand-new empty room and stranding the user in it.
//
// NOTE: /api/room/<code> probes the IMPOSTOR_ROOM DO namespace for its phase
// payload, so it is only authoritative for impostor rooms. Other games would
// need their own existence endpoint before reusing this — do not call this from
// card/liars-dice/casino lobbies.
export async function impostorRoomExists(code: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/room/${encodeURIComponent(code)}`);
    if (res.status === 404) return false;
    // Any other status (200 found, 429 rate-limited, 5xx) is treated as
    // "don't block the join" — fail open so a flaky probe never stops a real
    // join; the socket path still surfaces genuine connection errors.
    return true;
  } catch {
    return true;
  }
}
