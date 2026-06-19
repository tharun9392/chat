import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import axios from 'axios';
import { useNotification } from './NotificationContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5002/api';

interface CallContextType {
  isCalling: boolean;
  incomingCall: IncomingCallData | null;
  callActive: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  callType: 'audio' | 'video' | null;
  remoteUser: { username: string; profilePic?: string; displayName?: string } | null;
  
  initiateCall: (toUserId: string, type: 'audio' | 'video', otherUserData: any) => Promise<void>;
  answerCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  
  toggleAudio: () => void;
  toggleVideo: () => void;
  switchCamera: () => Promise<void>;
  facingMode: 'user' | 'environment';
  isMinimized: boolean;
  setIsMinimized: React.Dispatch<React.SetStateAction<boolean>>;
  isAudioMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  formatDuration: (seconds: number) => string;

  // New symmetric & synchronized calling fields
  callStatus: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended';
  isRemoteMuted: boolean;
  isRemoteVideoOff: boolean;
  isScreenSharing: boolean;
  isRemoteScreenSharing: boolean;
  networkQuality: 'excellent' | 'good' | 'poor' | 'unknown';
  activeReaction: { emoji: string; id: string } | null;
  sendReaction: (emoji: string) => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => Promise<void>;
  audioDevices: MediaDeviceInfo[];
  selectedAudioDevice: string;
  changeAudioOutput: (deviceId: string) => Promise<void>;
  isSpeakerOff: boolean;
  toggleSpeaker: () => void;
  videoFilter: string;
  remoteVideoFilter: string;
  setLocalVideoFilter: (filter: string) => void;
}

interface IncomingCallData {
  from: string;
  fromName: string;
  fromPic?: string;
  signal: any;
  type: 'audio' | 'video';
  callId?: string;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) throw new Error('useCall must be used within a CallProvider');
  return context;
};

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
};

const createDummyVideoTrack = (): MediaStreamTrack => {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0f172a'; // dark slate
    ctx.fillRect(0, 0, 640, 480);
  }
  const canvasStream = (canvas as any).captureStream ? (canvas as any).captureStream(1) : (canvas as any).mozCaptureStream(1);
  const track = canvasStream.getVideoTracks()[0];
  track.enabled = false;
  return track;
};

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const { user, token } = useAuth();
  const { addNotification } = useNotification();
  
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null);
  const [callActive, setCallActive] = useState(false);
  const [callType, setCallType] = useState<'audio' | 'video' | null>(null);
  
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [remoteUser, setRemoteUser] = useState<{ username: string; profilePic?: string; displayName?: string } | null>(null);
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [targetId, setTargetId] = useState<string | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMinimized, setIsMinimized] = useState(false);

  // New symmetric calling state variables
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'reconnecting' | 'ended'>('idle');
  const [isRemoteMuted, setIsRemoteMuted] = useState(false);
  const [isRemoteVideoOff, setIsRemoteVideoOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isRemoteScreenSharing, setIsRemoteScreenSharing] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<'excellent' | 'good' | 'poor' | 'unknown'>('unknown');
  const [activeReaction, setActiveReaction] = useState<{ emoji: string; id: string } | null>(null);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState<string>('');
  const [isSpeakerOff, setIsSpeakerOff] = useState(false);
  const [videoFilter, setVideoFilter] = useState<string>('none');
  const [remoteVideoFilter, setRemoteVideoFilter] = useState<string>('none');

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const bufferedIceCandidates = useRef<RTCIceCandidate[]>([]);
  const isUsingDummyVideoRef = useRef(false);
  const isCallerRef = useRef(false);

  const cleanup = useCallback(() => {
    // Finalize call record on the backend
    if (callId) {
      const isMissed = !callActive && (isCalling || incomingCall);
      axios.put(`${API_URL}/calls/${callId}`, 
        { status: isMissed ? 'missed' : 'completed', duration: callDuration },
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      ).catch(err => console.error('Error finalizing call log:', err));

      if (isMissed && targetId) {
        // Send a "Missed Call" message to the chat
        axios.post(`${API_URL}/chats/message`, {
          receiverId: targetId,
          content: `📞 Missed ${callType === 'video' ? 'video' : 'voice'} call`,
          isCallLog: true,
          encrypted: false
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(err => console.error('Failed to send missed call message:', err));
      } else if (callActive && targetId) {
        // Send a "Call Ended" message to the chat
        axios.post(`${API_URL}/chats/message`, {
          receiverId: targetId,
          content: `📞 ${callType === 'video' ? 'Video' : 'Voice'} call ended • ${formatDuration(callDuration)}`,
          isCallLog: true,
          encrypted: false
        }, { headers: { Authorization: `Bearer ${token}` } }).catch(err => console.error('Failed to send call ended message:', err));
      }
    }

    bufferedIceCandidates.current = [];

    if (peerConnection.current) {
      peerConnection.current.close();
      peerConnection.current = null;
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setRemoteStream(null);
    setRemoteUser(null);
    setIsCalling(false);
    setIncomingCall(null);
    setCallActive(false);
    setCallType(null);
    setTargetId(null);
    setCallId(null);
    setCallDuration(0);
    setIsAudioMuted(false);
    setIsVideoOff(false);
    setIsMinimized(false);
    setFacingMode('user');

    // Reset new states
    setCallStatus('idle');
    setIsRemoteMuted(false);
    setIsRemoteVideoOff(false);
    setIsScreenSharing(false);
    setIsRemoteScreenSharing(false);
    setNetworkQuality('unknown');
    setActiveReaction(null);
    setIsSpeakerOff(false);
    isUsingDummyVideoRef.current = false;
    isCallerRef.current = false;
    setVideoFilter('none');
    setRemoteVideoFilter('none');
  }, [callId, callDuration, callActive, isCalling, incomingCall, targetId, callType, token]);

  const handleIceRestart = useCallback(async () => {
    if (!peerConnection.current || !targetId || !isCallerRef.current) return;
    try {
      console.log('WebRTC: Initiating ICE restart...');
      setCallStatus('reconnecting');
      const offer = await peerConnection.current.createOffer({ iceRestart: true });
      await peerConnection.current.setLocalDescription(offer);
      socket?.emit('call_signal', { to: targetId, signal: offer });
    } catch (e) {
      console.error('WebRTC: ICE restart failed:', e);
    }
  }, [socket, targetId]);

  const setupPeerConnection = useCallback((toId: string) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    // Set remote stream is now handled by ontrack
    // Removed the placeholder MediaStream to match strict requirements
    setRemoteStream(null);

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('call_signal', { to: toId, signal: { candidate: event.candidate } });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`WebRTC: Connection state changed to: ${pc.connectionState}`);
      if (pc.connectionState === 'connected') {
        setCallStatus('connected');
      } else if (pc.connectionState === 'connecting') {
        setCallStatus('connecting');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setCallStatus('reconnecting');
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`WebRTC: ICE connection state: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'failed') {
        handleIceRestart();
      }
    };

    pc.onnegotiationneeded = async () => {
      if (!isCallerRef.current) return;
      try {
        console.log('WebRTC: Negotiation needed, creating offer...');
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket?.emit('call_signal', { to: toId, signal: offer });
      } catch (err) {
        console.error('WebRTC: Negotiation error:', err);
      }
    };

    pc.ontrack = (event) => {
      console.log('WebRTC: ontrack event, track kind:', event.track.kind);
      if (event.streams && event.streams[0]) {
        console.log('WebRTC: remoteStream tracks:', event.streams[0].getTracks().map(t => `${t.kind}:${t.label}`));
        // Create a new MediaStream instance to force React state update on new track arrival
        setRemoteStream(new MediaStream(event.streams[0].getTracks()));
      } else {
        console.log('WebRTC: Fallback creating remoteStream from tracks');
        setRemoteStream(prev => {
          const stream = prev || new MediaStream();
          if (!stream.getTracks().some(t => t.id === event.track.id)) {
            stream.addTrack(event.track);
          }
          return new MediaStream(stream.getTracks());
        });
      }
    };

    if (localStreamRef.current) {
      console.log('WebRTC: Adding local tracks to PeerConnection');
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnection.current = pc;
    return pc;
  }, [socket, handleIceRestart]);

  const initiateCall = async (toUserId: string, type: 'audio' | 'video', otherUser: any) => {
    try {
      isCallerRef.current = true;
      
      // Unlock remote audio context on gesture if possible
      const remoteAudio = document.getElementById('remoteAudio') as HTMLAudioElement;
      if (remoteAudio) {
        remoteAudio.play().catch(() => {});
      }

      setCallStatus('calling');
      setCallType(type);
      setTargetId(toUserId);
      setRemoteUser(otherUser);
      setIsCalling(true);

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: type === 'video',
          audio: true
        });
      } catch (mediaError) {
        console.warn('Failed to get media with requested type, trying audio-only fallback:', mediaError);
        if (type === 'video') {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true
            });
            setIsVideoOff(true);
            isUsingDummyVideoRef.current = true;
            const dummyTrack = createDummyVideoTrack();
            stream.addTrack(dummyTrack);
            if ((mediaError as any).name === 'NotReadableError') {
              addNotification('Camera is in use by another application or tab. Starting call with camera off.', 'warning');
            } else {
              addNotification('Camera access failed, starting video call with camera off.', 'warning');
            }
          } catch (audioError) {
            console.error('Audio-only fallback also failed:', audioError);
            addNotification('Could not access microphone or camera. Please verify device permissions.', 'error');
            throw audioError;
          }
        } else {
          addNotification('Could not access microphone. Please verify device permissions.', 'error');
          throw mediaError;
        }
      }
      
      setLocalStream(stream);
      localStreamRef.current = stream;

      // Small delay to ensure tracks are active before Offer
      await new Promise(resolve => setTimeout(resolve, 500));

      const pc = setupPeerConnection(toUserId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      let currentCallId = null;
      try {
        const response = await axios.post(`${API_URL}/calls`, 
          { 
            receiverId: toUserId, 
            type: type,
            chatId: 'general' 
          },
          { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
        );
        currentCallId = response.data._id;
        setCallId(currentCallId);
      } catch (err) {
        console.error('Error creating call log:', err);
      }

      socket?.emit('call_user', {
        to: toUserId,
        from: user?.id || user?._id,
        fromName: user?.displayName || user?.username || 'Unknown',
        fromPic: user?.profilePic,
        signalData: offer,
        type: type,
        callId: currentCallId
      });
    } catch (error) {
      console.error('Failed to initiate call:', error);
      cleanup();
    }
  };

  const answerCall = async () => {
    if (!incomingCall || !socket) return;
    
    try {
      isCallerRef.current = false;

      // Unlock remote audio context on gesture if possible
      const remoteAudio = document.getElementById('remoteAudio') as HTMLAudioElement;
      if (remoteAudio) {
        remoteAudio.play().catch(() => {});
      }

      setCallStatus('connecting');
      setCallType(incomingCall.type);
      setTargetId(incomingCall.from);
      
      let stream: MediaStream;
      let cameraFailed = false;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: incomingCall.type === 'video',
          audio: true
        });
      } catch (mediaError) {
        console.warn('Failed to get media with requested type on answer, trying audio-only fallback:', mediaError);
        if (incomingCall.type === 'video') {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: false,
              audio: true
            });
            cameraFailed = true;
            setIsVideoOff(true);
            isUsingDummyVideoRef.current = true;
            const dummyTrack = createDummyVideoTrack();
            stream.addTrack(dummyTrack);
            if ((mediaError as any).name === 'NotReadableError') {
              addNotification('Camera is in use by another application or tab. Answering call with camera off.', 'warning');
            } else {
              addNotification('Camera access failed, answering video call with camera off.', 'warning');
            }
          } catch (audioError) {
            console.error('Audio-only fallback also failed on answer:', audioError);
            addNotification('Could not access microphone or camera. Please verify device permissions.', 'error');
            throw audioError;
          }
        } else {
          addNotification('Could not access microphone. Please verify device permissions.', 'error');
          throw mediaError;
        }
      }
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      setRemoteUser({
        username: incomingCall.fromName,
        profilePic: incomingCall.fromPic
      });

      // Small delay to ensure tracks are active before Answer
      await new Promise(resolve => setTimeout(resolve, 500));

      const pc = setupPeerConnection(incomingCall.from);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.signal));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('answer_call', {
        to: incomingCall.from,
        signal: answer
      });

      // Emit local media states so the caller receives them immediately upon answer
      socket.emit('call_state_change', {
        to: incomingCall.from,
        state: {
          isMuted: isAudioMuted,
          isVideoOff: cameraFailed, // Use direct local variable to avoid batching race condition
          isScreenSharing: isScreenSharing,
          videoFilter: videoFilter
        }
      });

      // Process any buffered candidates that arrived while ringing
      while (bufferedIceCandidates.current.length > 0) {
        const candidate = bufferedIceCandidates.current.shift();
        if (candidate && pc) {
          await pc.addIceCandidate(candidate);
        }
      }

      setIncomingCall(null);
      setCallActive(true);
    } catch (error) {
      console.error('Failed to answer call:', error);
      cleanup();
    }
  };

  const rejectCall = () => {
    if (incomingCall && socket) {
      socket.emit('end_call', { to: incomingCall.from });
    }
    cleanup();
  };

  const endCall = () => {
    if (targetId && socket) {
      socket.emit('end_call', { to: targetId });
    }
    cleanup();
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Live Timer Effect
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (callActive) {
      interval = setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [callActive]);

  const toggleAudio = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsAudioMuted(!audioTrack.enabled);

        if (targetId && socket) {
          socket.emit('call_state_change', {
            to: targetId,
            state: {
              isMuted: !audioTrack.enabled,
              isVideoOff: isVideoOff,
              isScreenSharing: isScreenSharing,
              videoFilter: videoFilter
            }
          });
        }
      }
    }
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    
    const videoTrack = localStreamRef.current.getVideoTracks()[0];
    
    // Case 1: Currently using dummy video track, try to acquire real camera track
    if (isUsingDummyVideoRef.current || !videoTrack) {
      try {
        const cameraStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
        const realTrack = cameraStream.getVideoTracks()[0];
        if (!realTrack) return;

        // Stop and remove old dummy track
        if (videoTrack) {
          videoTrack.stop();
          localStreamRef.current.removeTrack(videoTrack);
        }

        // Add real track
        localStreamRef.current.addTrack(realTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        isUsingDummyVideoRef.current = false;
        setIsVideoOff(false);

        // Replace track in peer connection
        if (peerConnection.current) {
          const senders = peerConnection.current.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(realTrack);
            console.log('WebRTC: Replaced dummy video track with real camera track');
          }
        }

        // Notify remote peer
        if (targetId && socket) {
          socket.emit('call_state_change', {
            to: targetId,
            state: {
              isMuted: isAudioMuted,
              isVideoOff: false,
              isScreenSharing: isScreenSharing,
              videoFilter: videoFilter
            }
          });
        }
        addNotification('Camera turned on successfully.', 'success');
      } catch (err) {
        console.error('Failed to acquire real camera:', err);
        if ((err as any).name === 'NotReadableError') {
          addNotification('Camera is in use by another application or browser tab.', 'error');
        } else {
          addNotification('Camera device is locked or unavailable.', 'error');
        }
      }
    } else {
      // Case 2: Using real camera track. Stop the track to release the hardware lock, and replace with a dummy track.
      videoTrack.stop();
      if (localStreamRef.current) {
        localStreamRef.current.removeTrack(videoTrack);
        const dummyTrack = createDummyVideoTrack();
        localStreamRef.current.addTrack(dummyTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
      isUsingDummyVideoRef.current = true;
      setIsVideoOff(true);

      // Replace track in peer connection
      if (peerConnection.current) {
        const senders = peerConnection.current.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          const dummyTrack = localStreamRef.current?.getVideoTracks()[0];
          if (dummyTrack) {
            await videoSender.replaceTrack(dummyTrack);
            console.log('WebRTC: Replaced real video track with dummy track to release hardware lock');
          }
        }
      }

      if (targetId && socket) {
        socket.emit('call_state_change', {
          to: targetId,
          state: {
            isMuted: isAudioMuted,
            isVideoOff: true,
            isScreenSharing: isScreenSharing,
            videoFilter: videoFilter
          }
        });
      }
      addNotification('Camera turned off.', 'info');
    }
  };

  const switchCamera = async () => {
    if (!localStream || callType !== 'video') return;

    const newFacingMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newFacingMode);

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: newFacingMode } },
        audio: false
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) return;

      const oldVideoTrack = localStream.getVideoTracks()[0];
      if (oldVideoTrack) {
        oldVideoTrack.stop();
        localStream.removeTrack(oldVideoTrack);
      }

      localStream.addTrack(newVideoTrack);
      localStreamRef.current = localStream;
      setLocalStream(new MediaStream(localStream.getTracks()));

      if (peerConnection.current) {
        const senders = peerConnection.current.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
          console.log('WebRTC: Video track successfully replaced on PeerConnection');
        }
      }
      
      addNotification(`Switched to ${newFacingMode === 'user' ? 'front' : 'back'} camera.`, 'info');
    } catch (err) {
      console.error('Failed to switch camera:', err);
      addNotification('Could not switch camera. Check if device is available.', 'error');
    }
  };

  // Screen sharing controls
  const startScreenShare = async () => {
    if (!callActive || !peerConnection.current) return;
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false
      });
      screenStreamRef.current = screenStream;
      const screenTrack = screenStream.getVideoTracks()[0];

      screenTrack.onended = () => {
        stopScreenShare();
      };

      const senders = peerConnection.current.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }

      setIsScreenSharing(true);

      socket?.emit('call_state_change', {
        to: targetId,
        state: {
          isMuted: isAudioMuted,
          isVideoOff: isVideoOff,
          isScreenSharing: true,
          videoFilter: videoFilter
        }
      });
      addNotification('Screen sharing started.', 'info');
    } catch (err) {
      console.error('Failed to start screen sharing:', err);
      if ((err as any).name !== 'NotAllowedError') {
        addNotification('Could not share screen.', 'error');
      }
    }
  };

  const stopScreenShare = async () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    setIsScreenSharing(false);

    try {
      if (peerConnection.current) {
        let cameraTrack: MediaStreamTrack | null = null;
        if (localStream) {
          cameraTrack = localStream.getVideoTracks()[0];
        }

        if (!cameraTrack || cameraTrack.readyState === 'ended') {
          const tempStream = await navigator.mediaDevices.getUserMedia({
            video: callType === 'video',
            audio: false
          });
          cameraTrack = tempStream.getVideoTracks()[0];
          if (localStream) {
            const oldVideo = localStream.getVideoTracks()[0];
            if (oldVideo) localStream.removeTrack(oldVideo);
            localStream.addTrack(cameraTrack);
            setLocalStream(new MediaStream(localStream.getTracks()));
          }
        }

        if (cameraTrack) {
          cameraTrack.enabled = !isVideoOff;
          const senders = peerConnection.current.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          if (videoSender) {
            await videoSender.replaceTrack(cameraTrack);
          }
        }
      }
    } catch (err) {
      console.error('Failed to restore camera track:', err);
    }

    socket?.emit('call_state_change', {
      to: targetId,
      state: {
        isMuted: isAudioMuted,
        isVideoOff: isVideoOff,
        isScreenSharing: false,
        videoFilter: videoFilter
      }
    });
    addNotification('Screen sharing stopped.', 'info');
  };

  // Emojis / Reactions control
  const sendReaction = (emoji: string) => {
    const id = Math.random().toString();
    setActiveReaction({ emoji, id });
    socket?.emit('call_reaction', { to: targetId, reaction: emoji });
    setTimeout(() => {
      setActiveReaction(prev => prev?.id === id ? null : prev);
    }, 3000);
  };

  // Audio output device routing
  const changeAudioOutput = async (deviceId: string) => {
    setSelectedAudioDevice(deviceId);
    const audioElements = document.querySelectorAll('video, audio');
    for (let el of Array.from(audioElements)) {
      if ((el as any).setSinkId && !(el as any).muted && el.id !== 'localVideo') {
        try {
          await (el as any).setSinkId(deviceId);
          console.log(`Audio output successfully set to device: ${deviceId}`);
        } catch (err) {
          console.error("Failed to set audio output device via setSinkId:", err);
        }
      }
    }
  };

  // Speaker toggle (muting remote outputs)
  const toggleSpeaker = () => {
    setIsSpeakerOff(prev => {
      const nextVal = !prev;
      const remoteAudio = document.getElementById('remoteAudio') as HTMLAudioElement;
      if (remoteAudio) {
        remoteAudio.muted = nextVal;
      }
      return nextVal;
    });
  };

  const setLocalVideoFilter = useCallback((newFilter: string) => {
    setVideoFilter(newFilter);
    if (targetId && socket) {
      socket.emit('call_state_change', {
        to: targetId,
        state: {
          isMuted: isAudioMuted,
          isVideoOff: isVideoOff,
          isScreenSharing: isScreenSharing,
          videoFilter: newFilter
        }
      });
    }
  }, [targetId, socket, isAudioMuted, isVideoOff, isScreenSharing]);

  // Monitor network round-trip time (RTT)
  useEffect(() => {
    if (!callActive || !peerConnection.current) {
      setNetworkQuality('unknown');
      return;
    }

    const checkStats = async () => {
      if (!peerConnection.current) return;
      try {
        const stats = await peerConnection.current.getStats();
        let rtt = 0;
        stats.forEach(report => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = report.currentRoundTripTime * 1000;
          }
        });
        if (rtt > 0) {
          if (rtt < 100) setNetworkQuality('excellent');
          else if (rtt < 250) setNetworkQuality('good');
          else setNetworkQuality('poor');
        } else {
          setNetworkQuality('excellent'); // default to excellent if local P2P
        }
      } catch (err) {
        setNetworkQuality('unknown');
      }
    };

    const interval = setInterval(checkStats, 3000);
    return () => clearInterval(interval);
  }, [callActive]);

  // Discover and list audio devices when call starts
  useEffect(() => {
    const getAudioDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        setAudioDevices(outputs);
        if (outputs.length > 0) {
          setSelectedAudioDevice(outputs[0].deviceId);
        }
      } catch (err) {
        console.error("Failed to list audio output devices:", err);
      }
    };
    if (callActive) {
      getAudioDevices();
    }
  }, [callActive]);

  useEffect(() => {
    if (!socket) return;

    socket.on('call_signal', async (data) => {
      if (data.signal.candidate) {
        const candidate = new RTCIceCandidate(data.signal.candidate);
        
        if (peerConnection.current && 
            peerConnection.current.remoteDescription && 
            peerConnection.current.remoteDescription.type) {
          try {
            await peerConnection.current.addIceCandidate(candidate);
          } catch (e) {
            console.error('WebRTC: Error adding ICE candidate:', e);
          }
        } else {
          // Buffer candidates until remote description is set or PC is created
          console.log('WebRTC: Buffering ICE candidate');
          bufferedIceCandidates.current.push(candidate);
        }
      } else if (data.signal.type === 'offer') {
        console.log('WebRTC: Received renegotiation offer from remote peer');
        if (peerConnection.current) {
          try {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
            const answer = await peerConnection.current.createAnswer();
            await peerConnection.current.setLocalDescription(answer);
            socket.emit('call_signal', { to: data.from, signal: answer });
          } catch (e) {
            console.error('WebRTC: Error handling renegotiation offer:', e);
          }
        }
      } else if (data.signal.type === 'answer') {
        console.log('WebRTC: Received renegotiation answer from remote peer');
        if (peerConnection.current) {
          try {
            await peerConnection.current.setRemoteDescription(new RTCSessionDescription(data.signal));
          } catch (e) {
            console.error('WebRTC: Error setting renegotiation answer:', e);
          }
        }
      }
    });

    socket.on('call_ringing', () => {
      console.log('WebRTC: Call ringing on remote end');
      setCallStatus('ringing');
    });

    socket.on('call_accepted', async (data) => {
      console.log('WebRTC: Call accepted by remote peer');
      if (peerConnection.current) {
        try {
          const signal = data.signal || data;
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal));
          setCallActive(true);
          setIsCalling(false);
          setCallStatus('connecting');

          // Notify remote peer of local media states immediately upon connection
          socket.emit('call_state_change', {
            to: targetId,
            state: {
              isMuted: isAudioMuted,
              isVideoOff: isVideoOff,
              isScreenSharing: isScreenSharing,
              videoFilter: videoFilter
            }
          });
          
          // Process any buffered candidates
          console.log(`WebRTC: Processing ${bufferedIceCandidates.current.length} buffered ICE candidates`);
          while (bufferedIceCandidates.current.length > 0) {
            const candidate = bufferedIceCandidates.current.shift();
            if (candidate) {
              await peerConnection.current.addIceCandidate(candidate);
            }
          }
        } catch (err) {
          console.error('WebRTC: Error setting remote description on call_accepted:', err);
        }
      }
    });

    socket.on('incoming_call', async (data: IncomingCallData) => {
      console.log('WebRTC: Incoming call from:', data.fromName);
      isCallerRef.current = false;
      setIncomingCall(data);
      if (data.callId) setCallId(data.callId);
      setCallStatus('ringing');
      // Notify caller that their call is ringing on our end
      socket.emit('call_ringing', { to: data.from });
    });

    socket.on('call_ended', () => {
      console.log('Remote peer ended the call');
      // Briefly show "Call Ended" status before cleanup
      setCallStatus('ended');
      setTimeout(() => {
        cleanup();
      }, 2000);
    });

    socket.on('call_state_change', (data) => {
      console.log('WebRTC: Received remote call state change:', data.state);
      if (data.state) {
        setIsRemoteMuted(!!data.state.isMuted);
        setIsRemoteVideoOff(!!data.state.isVideoOff);
        setIsRemoteScreenSharing(!!data.state.isScreenSharing);
        if (data.state.videoFilter !== undefined) {
          setRemoteVideoFilter(data.state.videoFilter);
        }
      }
    });

    socket.on('call_reaction', (data) => {
      console.log('WebRTC: Received reaction:', data.reaction);
      const id = Math.random().toString();
      setActiveReaction({ emoji: data.reaction, id });
      setTimeout(() => {
        setActiveReaction(prev => prev?.id === id ? null : prev);
      }, 3000);
    });

    socket.on('call_error', (data: { message: string }) => {
      console.error('Call signaling error:', data.message);
      alert(`Call failed: ${data.message}`);
      cleanup();
    });

    return () => {
      socket.off('incoming_call');
      socket.off('call_accepted');
      socket.off('call_signal');
      socket.off('call_ended');
      socket.off('call_ringing');
      socket.off('call_state_change');
      socket.off('call_reaction');
      socket.off('call_error');
    };
  }, [socket, cleanup, targetId, isAudioMuted, isVideoOff, isScreenSharing, videoFilter]);

  return (
    <CallContext.Provider value={{
      isCalling,
      incomingCall,
      callActive,
      localStream,
      remoteStream,
      callType,
      remoteUser,
      initiateCall,
      answerCall,
      rejectCall,
      endCall,
      toggleAudio,
      toggleVideo,
      switchCamera,
      facingMode,
      isMinimized,
      setIsMinimized,
      isAudioMuted,
      isVideoOff,
      callDuration,
      formatDuration,

      // New properties
      callStatus,
      isRemoteMuted,
      isRemoteVideoOff,
      isScreenSharing,
      isRemoteScreenSharing,
      networkQuality,
      activeReaction,
      sendReaction,
      startScreenShare,
      stopScreenShare,
      audioDevices,
      selectedAudioDevice,
      changeAudioOutput,
      isSpeakerOff,
      toggleSpeaker,
      videoFilter,
      remoteVideoFilter,
      setLocalVideoFilter
    }}>
      {children}
    </CallContext.Provider>
  );
};
