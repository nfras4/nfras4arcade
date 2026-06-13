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
}

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

  /** Tracks which peers have already fired onRemoteStream (one per peer) */
  private gotStreamFromPeer = new Set<string>();

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
   * Handle incoming SDP or candidate.
   */
  async handleSignal(from: string, payload: SignalPayload): Promise<void> {
    const peer = this.peers.get(from);
    if (!peer) return; // Peer not tracked

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
   * Triggers renegotiation for initiator role (selfId < peerId).
   */
  attachLocalStream(stream: MediaStream): void {
    this.localStream = stream;

    // Add tracks to all existing peer connections
    for (const [peerId, peer] of this.peers) {
      for (const track of stream.getTracks()) {
        peer.pc.addTrack(track, stream);
      }

      // Renegotiate if we're the initiator
      if (this.selfId < peerId) {
        void this.negotiate(peerId);
      }
    }
  }

  /**
   * Detach the local media stream from all peer connections.
   * Removes all senders associated with the prior local stream.
   * Triggers renegotiation for initiator role (selfId < peerId).
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

      // Renegotiate if we're the initiator
      if (this.selfId < peerId) {
        void this.negotiate(peerId);
      }
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

    // Wire up remote track handler (for onRemoteStream callback)
    pc.ontrack = (ev) => {
      if (ev.streams && ev.streams.length > 0 && !this.gotStreamFromPeer.has(peerId)) {
        this.gotStreamFromPeer.add(peerId);
        this.onRemoteStream?.(peerId, ev.streams[0]);
      }
    };

    // Create a data channel for keepalive BEFORE createOffer
    // so the SDP has at least one m-line (modern browsers reject empty offers).
    const dc = pc.createDataChannel('keepalive');
    dc.onopen = () => {
      // Optionally ping to keep the connection alive
    };

    const peerConn: PeerConnection = { pc, dataChannel: dc, pendingCandidates: [] };
    this.peers.set(peerId, peerConn);

    // Add local stream tracks if available
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // If we're the initiator (selfId < peerId), create and send offer
    if (this.selfId < peerId) {
      void this.negotiate(peerId);
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

    if (peer.dataChannel) {
      peer.dataChannel.close();
    }
    peer.pc.close();

    this.peers.delete(peerId);
    this.gotStreamFromPeer.delete(peerId);
    this.onPeerRemoved?.(peerId);
  }
}
