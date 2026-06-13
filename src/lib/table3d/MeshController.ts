/**
 * Browser-only WebRTC mesh controller.
 * Manages one RTCPeerConnection per peer.
 * Stage B: data-only (keepalive channel); no media.
 */

/**
 * Options for MeshController constructor.
 */
export interface MeshControllerOpts {
  selfId: string;
  iceServers: RTCIceServer[];
  sendSignal: (to: string, payload: unknown) => void;
  onPeerConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  onPeerRemoved?: (peerId: string) => void;
}

/**
 * Payload for rtc_signal messages.
 * Either contains an SDP (offer or answer) or an ICE candidate.
 */
interface SignalPayload {
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
}

/**
 * Tracks one RTCPeerConnection per peer.
 */
interface PeerConnection {
  pc: RTCPeerConnection;
  dataChannel?: RTCDataChannel;
  /**
   * ICE candidates that arrived before setRemoteDescription completed.
   * Drained after setRemoteDescription resolves; cleared after drain.
   */
  pendingCandidates: RTCIceCandidateInit[];
  /**
   * Per-peer serial queue for handleSignal. Concurrent signals for the same
   * peer (e.g. an offer arriving while an earlier offer is mid-await on
   * setRemoteDescription) would otherwise interleave at await points and
   * corrupt the signalling state-machine. Each incoming signal chains onto
   * this promise so processing is strictly serial per peer.
   */
  signalQueue: Promise<void>;
  /**
   * Last remote stream seen via pc.ontrack. Used to decide whether a new
   * ontrack event corresponds to a fresh stream (after detach + re-attach)
   * and should re-fire onRemoteStream.
   */
  lastStream: MediaStream | null;
  /**
   * Interval id for the keepalive data-channel ping. Cleared in closePeer.
   */
  keepaliveInterval?: ReturnType<typeof setInterval>;
}

const UNKNOWN_PEER_BUFFER_TTL_MS = 3000;

export class MeshController {
  private selfId: string;
  private iceServers: RTCIceServer[];
  private sendSignal: (to: string, payload: unknown) => void;
  private onPeerConnectionStateChange?: (peerId: string, state: RTCPeerConnectionState) => void;
  private onRemoteStream?: (peerId: string, stream: MediaStream) => void;
  private onPeerRemoved?: (peerId: string) => void;

  /** Map of peerId -> { pc, dataChannel? } */
  private peers = new Map<string, PeerConnection>();

  /** Local media stream for audio/video */
  private localStream: MediaStream | null = null;

  /**
   * Short-TTL buffer for signals that arrive for a peer we don't yet track
   * (createPeer hasn't run, or there was a brief remove+re-add churn).
   * Entries older than UNKNOWN_PEER_BUFFER_TTL_MS are discarded when drained.
   */
  private unknownPeerBuffer = new Map<string, Array<{ payload: SignalPayload; ts: number }>>();

  constructor(opts: MeshControllerOpts) {
    this.selfId = opts.selfId;
    this.iceServers = opts.iceServers ?? [];
    this.sendSignal = opts.sendSignal;
    this.onPeerConnectionStateChange = opts.onPeerConnectionStateChange;
    this.onRemoteStream = opts.onRemoteStream;
    this.onPeerRemoved = opts.onPeerRemoved;
  }

  /**
   * Update the set of peers. Creates/closes connections as needed.
   * Initiator rule: selfId < peerId => self initiates offer.
   */
  updatePeers(peerIds: Iterable<string>): void {
    const nextPeerIds = new Set(peerIds);

    // Remove peers no longer in the set
    for (const peerId of this.peers.keys()) {
      if (!nextPeerIds.has(peerId)) {
        this.closePeer(peerId);
      }
    }

    // Add new peers
    for (const peerId of nextPeerIds) {
      if (!this.peers.has(peerId)) {
        this.createPeer(peerId);
      }
    }
  }

  /**
   * Handle incoming SDP or candidate. Serialised per peer via signalQueue so
   * concurrent signals can't interleave inside the async body (fix #24).
   */
  handleSignal(from: string, payload: SignalPayload): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) {
      // Buffer for unknown peers (fix #25) so signals that race ahead of
      // createPeer aren't silently dropped. Drained when the peer is added.
      let bucket = this.unknownPeerBuffer.get(from);
      if (!bucket) {
        bucket = [];
        this.unknownPeerBuffer.set(from, bucket);
      }
      bucket.push({ payload, ts: Date.now() });
      return Promise.resolve();
    }

    const next = peer.signalQueue.then(() => this._handleSignalUnsafe(from, payload)).catch((err) => {
      if (import.meta.env.DEV) {
        console.error('[mesh] signal error', from, err);
      }
    });
    peer.signalQueue = next;
    return next;
  }

  private async _handleSignalUnsafe(from: string, payload: SignalPayload): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return; // Peer may have been removed while queued

    if (payload.sdp) {
      // Offer or answer
      const description = payload.sdp;

      // If we have a local offer and we're the polite peer (selfId > from),
      // rollback first to handle glare.
      if (
        description.type === 'offer' &&
        peer.pc.signalingState === 'have-local-offer' &&
        this.selfId > from
      ) {
        await peer.pc.setLocalDescription({ type: 'rollback' });
      }

      await peer.pc.setRemoteDescription(new RTCSessionDescription(description));

      // Drain any ICE candidates that arrived before setRemoteDescription resolved.
      if (peer.pendingCandidates.length > 0) {
        for (const q of peer.pendingCandidates) {
          try {
            await peer.pc.addIceCandidate(new RTCIceCandidate(q));
          } catch (err) {
            if (import.meta.env.DEV) {
              console.error('[mesh] drain addIceCandidate failed for', from, err);
            }
          }
        }
        peer.pendingCandidates.length = 0;
      }

      if (description.type === 'offer') {
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal(from, { sdp: answer });
      }
    } else if (payload.candidate !== undefined) {
      // ICE candidate (or null for end-of-candidates)
      if (payload.candidate === null) {
        // End of candidates marker; nothing to add
      } else if (peer.pc.remoteDescription === null) {
        // Remote description not yet set; queue candidate for drain after SRD.
        peer.pendingCandidates.push(payload.candidate);
      } else {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          // Ignore add candidate errors (candidate may be stale / unparseable)
        }
      }
    }
  }

  /**
   * Attach a local media stream to all existing peer connections.
   * Newly-created peers will also receive the local stream.
   * Renegotiates symmetrically from whichever side called attach (fix #22):
   * the deterministic-initiator rule only governs the INITIAL connection.
   */
  attachLocalStream(stream: MediaStream): void {
    this.localStream = stream;

    // Add tracks to all existing peer connections
    for (const [peerId, peer] of this.peers) {
      for (const track of stream.getTracks()) {
        peer.pc.addTrack(track, stream);
      }

      // Renegotiate unconditionally so the remote side learns about the
      // new tracks regardless of which side called attach.
      void this.negotiate(peerId);
    }
  }

  /**
   * Detach the local media stream from all peer connections.
   * Removes all senders associated with the prior local stream.
   * Renegotiates symmetrically (fix #22) so the remote side stops receiving
   * an inactive track even when selfId > peerId.
   * Caller is responsible for stopping the underlying MediaStreamTrack objects.
   */
  detachLocalStream(): void {
    const stream = this.localStream;
    this.localStream = null;

    if (!stream) return;

    // Remove senders for all tracks from this stream
    for (const [peerId, peer] of this.peers) {
      for (const sender of peer.pc.getSenders()) {
        if (sender.track && stream.getTracks().includes(sender.track)) {
          peer.pc.removeTrack(sender);
        }
      }

      // Renegotiate unconditionally (symmetrical detach).
      void this.negotiate(peerId);
    }
  }

  /**
   * Get all peer IDs currently tracked.
   */
  getPeerIds(): string[] {
    return Array.from(this.peers.keys());
  }

  /**
   * Trigger an ICE restart on every active peer connection.
   *
   * Wired to the websocket reconnect path: when the signalling channel comes
   * back up after a network blip, the underlying ICE pairs may still be stale
   * (NAT mapping expired, etc.). pc.restartIce() requests fresh candidates
   * without tearing down the media tracks. Each call is wrapped because a
   * peer in the wrong signalling state will throw synchronously and we don't
   * want one bad peer to stop the others from recovering.
   */
  restartAllIce(): void {
    for (const [peerId, peer] of this.peers) {
      try {
        peer.pc.restartIce();
      } catch (err) {
        if (typeof console !== 'undefined') {
          console.warn('[mesh] restartAllIce failed for', peerId, err);
        }
      }
    }
  }

  /**
   * Dispose: close all peer connections.
   */
  dispose(): void {
    for (const peerId of Array.from(this.peers.keys())) {
      this.closePeer(peerId);
    }
    this.unknownPeerBuffer.clear();
  }

  // ─ Private helpers ──────────────────────────────────────────────────────────

  private createPeer(peerId: string): void {
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // Wire up state change callback.
    //
    // Recovery policy:
    //   - "failed": connection is unrecoverable; close the peer entry and emit
    //     the state change. The caller (route layer) can re-add the peer to
    //     this.peers via updatePeers() on the next mesh tick if the peer is
    //     still in the room. We do NOT auto-recreate here to keep responsibility
    //     for membership ownership in one place.
    //   - "disconnected": transient ICE blip; attempt pc.restartIce() to repair
    //     the existing connection without tearing it down.
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      // Guard against stale handlers firing after the pc has been replaced.
      if (this.peers.get(peerId)?.pc !== pc) {
        return;
      }
      if (state === 'failed') {
        this.closePeer(peerId);
        this.onPeerConnectionStateChange?.(peerId, state);
        return;
      }
      if (state === 'disconnected') {
        try {
          pc.restartIce();
        } catch (err) {
          if (import.meta.env.DEV) {
            console.error('[mesh] restartIce failed for', peerId, err);
          }
        }
      }
      this.onPeerConnectionStateChange?.(peerId, state);
    };

    // Wire up ICE candidate handler
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        this.sendSignal(peerId, { candidate: ev.candidate.toJSON() });
      } else {
        // End of candidates
        this.sendSignal(peerId, { candidate: null });
      }
    };

    // Wire up remote track handler. Fires onRemoteStream whenever a NEW
    // stream object arrives (fix #22): after detach + re-attach the stream
    // identity changes, so we must re-emit. The prior boolean gate kept the
    // UI stuck on the dead stream.
    pc.ontrack = (ev) => {
      if (!ev.streams || ev.streams.length === 0) return;
      const stream = ev.streams[0];
      const entry = this.peers.get(peerId);
      if (!entry) return;
      if (entry.lastStream !== stream) {
        entry.lastStream = stream;
        this.onRemoteStream?.(peerId, stream);
      }
    };

    // Create a data channel for keepalive BEFORE createOffer
    // so the SDP has at least one m-line (modern browsers reject empty offers).
    const dc = pc.createDataChannel('keepalive');

    const peerConn: PeerConnection = {
      pc,
      dataChannel: dc,
      pendingCandidates: [],
      signalQueue: Promise.resolve(),
      lastStream: null,
    };
    this.peers.set(peerId, peerConn);

    dc.onopen = () => {
      // Keepalive ping (fix #50): periodically send a small payload so middle
      // boxes don't drop the underlying transport. Guarded against close so a
      // late firing after closePeer doesn't throw on a dead channel.
      const interval = setInterval(() => {
        try {
          dc.send('ping');
        } catch {
          // Channel closed; closePeer should have cleared this interval but
          // swallow defensively in case of races.
        }
      }, 15000);
      // Re-resolve entry in case closePeer ran between createPeer and onopen.
      const entry = this.peers.get(peerId);
      if (entry && entry.dataChannel === dc) {
        entry.keepaliveInterval = interval;
      } else {
        clearInterval(interval);
      }
    };

    // Add local stream tracks if available
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // If we're the initiator (selfId < peerId), create and send offer.
    // The deterministic-initiator rule only governs the INITIAL connection.
    if (this.selfId < peerId) {
      void this.negotiate(peerId);
    }

    // Drain any buffered signals that arrived before this peer was created
    // (fix #25). Stale entries beyond TTL are discarded.
    this.drainUnknownPeerBuffer(peerId);
  }

  /**
   * Drain buffered signals for a peer that was just created. Entries older
   * than UNKNOWN_PEER_BUFFER_TTL_MS are dropped; survivors are re-queued
   * through handleSignal so they pass through the per-peer signal queue.
   */
  private drainUnknownPeerBuffer(peerId: string): void {
    const bucket = this.unknownPeerBuffer.get(peerId);
    if (!bucket) return;
    this.unknownPeerBuffer.delete(peerId);
    const now = Date.now();
    for (const entry of bucket) {
      if (now - entry.ts <= UNKNOWN_PEER_BUFFER_TTL_MS) {
        void this.handleSignal(peerId, entry.payload);
      }
    }
  }

  /**
   * Awaitable negotiation: create offer, await setLocalDescription, then
   * send the SDP. Guards against the underlying pc being replaced between
   * await points (stale-pc guard).
   *
   * Returns early (no throw) if:
   *   - The peer is no longer tracked.
   *   - The pc has been replaced since negotiation started.
   */
  private async negotiate(peerId: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    const pc = peer.pc;

    try {
      // Stale-pc guard #1: confirm the pc is still the current one.
      if (this.peers.get(peerId)?.pc !== pc) return;

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Stale-pc guard #2: pc may have been replaced while awaiting SDP.
      if (this.peers.get(peerId)?.pc !== pc) return;

      this.sendSignal(peerId, { sdp: offer });
    } catch (err) {
      if (import.meta.env.DEV) {
        console.error('[mesh] negotiate failed for', peerId, err);
      }
    }
  }

  private closePeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    if (peer.keepaliveInterval !== undefined) {
      clearInterval(peer.keepaliveInterval);
    }
    if (peer.dataChannel) {
      peer.dataChannel.close();
    }
    peer.pc.close();

    this.peers.delete(peerId);
    this.onPeerRemoved?.(peerId);
  }
}
