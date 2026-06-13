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

      if (description.type === 'offer') {
        const answer = await peer.pc.createAnswer();
        await peer.pc.setLocalDescription(answer);
        this.sendSignal(from, { sdp: answer });
      }
    } else if (payload.candidate !== undefined) {
      // ICE candidate (or null for end-of-candidates)
      if (payload.candidate === null) {
        // End of candidates marker; nothing to add
      } else {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } catch {
          // Ignore add candidate errors (candidate may arrive before remote description)
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
        peer.pc
          .createOffer()
          .then((offer) => {
            peer.pc.setLocalDescription(offer);
            this.sendSignal(peerId, { sdp: offer });
          })
          .catch((err) => {
            console.error('[mesh] createOffer failed after attachLocalStream for', peerId, err);
          });
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
        peer.pc
          .createOffer()
          .then((offer) => {
            peer.pc.setLocalDescription(offer);
            this.sendSignal(peerId, { sdp: offer });
          })
          .catch((err) => {
            console.error('[mesh] createOffer failed after detachLocalStream for', peerId, err);
          });
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

    // Wire up state change callback
    pc.onconnectionstatechange = () => {
      this.onPeerConnectionStateChange?.(peerId, pc.connectionState);
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

    const peerConn: PeerConnection = { pc, dataChannel: dc };
    this.peers.set(peerId, peerConn);

    // Add local stream tracks if available
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        pc.addTrack(track, this.localStream);
      }
    }

    // If we're the initiator (selfId < peerId), create and send offer
    if (this.selfId < peerId) {
      pc.createOffer()
        .then((offer) => {
          pc.setLocalDescription(offer);
          this.sendSignal(peerId, { sdp: offer });
        })
        .catch((err) => {
          console.error('[mesh] createOffer failed for', peerId, err);
        });
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
