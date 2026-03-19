// =============================================================================
// lib/webrtc/callService.ts — WebRTC Voice & Video Call Service
//
// Architecture:
//   - RTCPeerConnection for media negotiation
//   - Supabase Realtime Broadcast channel for signaling (SDP + ICE candidates)
//   - ICE servers: STUN (free Google) + TURN (configured via env)
//   - Reconnection logic via ICE restart
//   - Clean state machine for call lifecycle
//
// Signaling flow (caller = A, callee = B):
//   A: creates offer → stores in call_sessions → broadcasts 'call_offer'
//   B: receives 'call_offer' → shows ringing UI
//   B: accepts → creates answer → broadcasts 'call_answer'
//   A: receives answer → sets remote description
//   Both: exchange ICE candidates via 'ice_candidate' broadcast
//   → media flows directly peer-to-peer
// =============================================================================

import type { RealtimeChannel } from '@supabase/supabase-js'
import type { CallType, SignalingEvent } from '@/types/database'

export type CallState =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'connecting'
  | 'active'
  | 'reconnecting'
  | 'ended'
  | 'failed'

export interface CallServiceCallbacks {
  onStateChange: (state: CallState) => void
  onRemoteStream: (stream: MediaStream) => void
  onRemoteStreamRemoved: () => void
  onError: (error: Error) => void
  onIncomingCall: (event: SignalingEvent) => void
  onCallEnded: (callId: string) => void
}

export interface IceConfig {
  iceServers: RTCIceServer[]
}

function getIceConfig(): IceConfig {
  const servers: RTCIceServer[] = [
    // STUN servers (free, for NAT traversal discovery)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  // TURN server config from environment (required for symmetric NAT)
  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL
  const turnUser = process.env.NEXT_PUBLIC_TURN_USERNAME
  const turnCred = process.env.NEXT_PUBLIC_TURN_CREDENTIAL

  if (turnUrl && turnUser && turnCred) {
    servers.push({
      urls: [turnUrl, turnUrl.replace('turn:', 'turns:')],
      username: turnUser,
      credential: turnCred,
    })
  }

  return { iceServers: servers }
}

export class CallService {
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private signalingChannel: RealtimeChannel | null = null
  private pendingIceCandidates: RTCIceCandidateInit[] = []
  private currentCallId: string | null = null
  private currentCallType: CallType = 'voice'
  private myUserId: string
  private peerUserId: string
  private state: CallState = 'idle'
  private callbacks: CallServiceCallbacks
  private restartIceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    myUserId: string,
    peerUserId: string,
    callbacks: CallServiceCallbacks
  ) {
    this.myUserId = myUserId
    this.peerUserId = peerUserId
    this.callbacks = callbacks
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  setSignalingChannel(channel: RealtimeChannel) {
    this.signalingChannel = channel
  }

  async initiateCall(callId: string, callType: CallType): Promise<void> {
    this.currentCallId = callId
    this.currentCallType = callType
    this.setState('initiating')

    try {
      this.localStream = await this.getUserMedia(callType)
      await this.createPeerConnection()

      // Add local tracks
      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!)
      })

      // Create offer
      const offer = await this.pc!.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === 'video',
      })
      await this.pc!.setLocalDescription(offer)

      // Send offer via signaling channel
      await this.sendSignalingEvent({
        type: 'call_offer',
        call_id: callId,
        from_user_id: this.myUserId,
        to_user_id: this.peerUserId,
        payload: { sdp: offer, call_type: callType },
      })

      this.setState('ringing')
    } catch (err) {
      this.handleError(err as Error)
    }
  }

  async acceptCall(
    callId: string,
    callType: CallType,
    offer: RTCSessionDescriptionInit
  ): Promise<MediaStream> {
    this.currentCallId = callId
    this.currentCallType = callType
    this.setState('connecting')

    try {
      this.localStream = await this.getUserMedia(callType)
      await this.createPeerConnection()

      this.localStream.getTracks().forEach(track => {
        this.pc!.addTrack(track, this.localStream!)
      })

      await this.pc!.setRemoteDescription(new RTCSessionDescription(offer))

      // Drain any queued ICE candidates
      for (const candidate of this.pendingIceCandidates) {
        await this.pc!.addIceCandidate(new RTCIceCandidate(candidate))
      }
      this.pendingIceCandidates = []

      const answer = await this.pc!.createAnswer()
      await this.pc!.setLocalDescription(answer)

      await this.sendSignalingEvent({
        type: 'call_answer',
        call_id: callId,
        from_user_id: this.myUserId,
        to_user_id: this.peerUserId,
        payload: { sdp: answer },
      })

      return this.localStream
    } catch (err) {
      this.handleError(err as Error)
      throw err
    }
  }

  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) return
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer))
    this.setState('active')
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) {
      // Queue until remote description is set
      this.pendingIceCandidates.push(candidate)
      return
    }
    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      console.warn('[WebRTC] Failed to add ICE candidate:', err)
    }
  }

  async rejectCall(callId: string): Promise<void> {
    await this.sendSignalingEvent({
      type: 'call_reject',
      call_id: callId,
      from_user_id: this.myUserId,
      to_user_id: this.peerUserId,
      payload: {},
    })
    this.cleanup()
  }

  async endCall(): Promise<void> {
    if (this.currentCallId) {
      await this.sendSignalingEvent({
        type: 'call_end',
        call_id: this.currentCallId,
        from_user_id: this.myUserId,
        to_user_id: this.peerUserId,
        payload: {},
      })
    }
    this.cleanup()
  }

  toggleMicrophone(enabled: boolean): void {
    this.localStream?.getAudioTracks().forEach(t => (t.enabled = enabled))
  }

  toggleCamera(enabled: boolean): void {
    this.localStream?.getVideoTracks().forEach(t => (t.enabled = enabled))
  }

  getLocalStream(): MediaStream | null {
    return this.localStream
  }

  // Graceful camera/mic replacement (for switching devices)
  async replaceVideoTrack(deviceId: string): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } },
    })
    const [newTrack] = stream.getVideoTracks()
    const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(newTrack)
    this.localStream?.getVideoTracks().forEach(t => t.stop())
  }

  // ===========================================================================
  // Private: Peer Connection Setup
  // ===========================================================================

  private async createPeerConnection(): Promise<void> {
    if (this.pc) {
      this.pc.close()
      this.pc = null
    }

    this.pc = new RTCPeerConnection(getIceConfig())

    this.pc.onicecandidate = (event) => {
      if (event.candidate && this.currentCallId) {
        this.sendSignalingEvent({
          type: 'ice_candidate',
          call_id: this.currentCallId,
          from_user_id: this.myUserId,
          to_user_id: this.peerUserId,
          payload: { candidate: event.candidate.toJSON() },
        })
      }
    }

    this.pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) {
        this.callbacks.onRemoteStream(remoteStream)
        this.setState('active')
      }
    }

    this.pc.onconnectionstatechange = () => {
      const state = this.pc?.connectionState
      console.log('[WebRTC] Connection state:', state)

      switch (state) {
        case 'connected':
          if (this.restartIceTimer) {
            clearTimeout(this.restartIceTimer)
            this.restartIceTimer = null
          }
          this.setState('active')
          break
        case 'disconnected':
          this.setState('reconnecting')
          this.scheduleIceRestart()
          break
        case 'failed':
          this.setState('failed')
          this.callbacks.onError(new Error('WebRTC connection failed'))
          this.cleanup()
          break
        case 'closed':
          this.setState('ended')
          break
      }
    }

    this.pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', this.pc?.iceGatheringState)
    }

    this.pc.onsignalingstatechange = () => {
      console.log('[WebRTC] Signaling state:', this.pc?.signalingState)
    }
  }

  private scheduleIceRestart(): void {
    if (this.restartIceTimer) clearTimeout(this.restartIceTimer)
    this.restartIceTimer = setTimeout(async () => {
      if (this.pc && this.pc.connectionState === 'disconnected') {
        console.log('[WebRTC] Attempting ICE restart...')
        try {
          const offer = await this.pc.createOffer({ iceRestart: true })
          await this.pc.setLocalDescription(offer)
          if (this.currentCallId) {
            await this.sendSignalingEvent({
              type: 'call_renegotiate',
              call_id: this.currentCallId,
              from_user_id: this.myUserId,
              to_user_id: this.peerUserId,
              payload: { sdp: offer },
            })
          }
        } catch (err) {
          console.error('[WebRTC] ICE restart failed:', err)
        }
      }
    }, 5000)
  }

  private async getUserMedia(callType: CallType): Promise<MediaStream> {
    const audioConstraints = callType === 'voice' 
      ? true  // Simplified constraints for voice calls
      : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }

    const constraints: MediaStreamConstraints = {
      audio: audioConstraints,
      video: callType === 'video' ? {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30 },
      } : false,
    }

    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (err) {
      console.error(`[WebRTC] getUserMedia failed for ${callType}:`, err)
      throw err
    }
  }

  private async sendSignalingEvent(event: SignalingEvent): Promise<void> {
    if (!this.signalingChannel) {
      console.error('[WebRTC] No signaling channel')
      return
    }
    await this.signalingChannel.send({
      type: 'broadcast',
      event: 'signaling',
      payload: event,
    })
  }

  private setState(state: CallState): void {
    if (this.state !== state) {
      this.state = state
      this.callbacks.onStateChange(state)
    }
  }

  private handleError(error: Error): void {
    console.error('[WebRTC] Error:', error)
    this.setState('failed')
    this.callbacks.onError(error)
    this.cleanup()
  }

  cleanup(): void {
    if (this.restartIceTimer) {
      clearTimeout(this.restartIceTimer)
      this.restartIceTimer = null
    }
    this.localStream?.getTracks().forEach(t => t.stop())
    this.pc?.close()
    this.pc = null
    this.localStream = null
    this.pendingIceCandidates = []
    this.currentCallId = null
    this.setState('ended')
  }
}
