import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import axios from 'axios';

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
  isAudioMuted: boolean;
  isVideoOff: boolean;
  callDuration: number;
  formatDuration: (seconds: number) => string;
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

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const { user, token } = useAuth();
  
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

  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const bufferedIceCandidates = useRef<RTCIceCandidate[]>([]);

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
  }, [callId, callDuration, callActive, isCalling, incomingCall, targetId, callType, token]);

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
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`WebRTC: ICE connection state: ${pc.iceConnectionState}`);
    };

    pc.ontrack = (event) => {
      console.log('WebRTC: ontrack event', event);
      if (event.streams && event.streams[0]) {
        console.log('WebRTC: remoteStream tracks:', event.streams[0].getVideoTracks());
        setRemoteStream(event.streams[0]);
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
  }, [socket]);

  const initiateCall = async (toUserId: string, type: 'audio' | 'video', otherUser: any) => {
    try {
      setCallType(type);
      setTargetId(toUserId);
      setRemoteUser(otherUser);
      setIsCalling(true);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: type === 'video',
        audio: true
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      console.log('WebRTC: localStream tracks:', stream.getVideoTracks());

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
            type, 
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
        fromName: user?.username || 'Unknown',
        fromPic: user?.profilePic,
        signalData: offer,
        type,
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
      setCallType(incomingCall.type);
      setTargetId(incomingCall.from);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: incomingCall.type === 'video',
        audio: true
      });
      
      setLocalStream(stream);
      localStreamRef.current = stream;
      console.log('WebRTC: localStream tracks (answer):', stream.getVideoTracks());
      setRemoteUser({
        username: incomingCall.fromName,
        profilePic: incomingCall.fromPic
      });

      // Small delay to ensure tracks are active before Answer
      await new Promise(resolve => setTimeout(resolve, 500));

      const pc = setupPeerConnection(incomingCall.from);
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.signal));
      console.log('WebRTC: Receiver - Remote description set successfully');
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log('WebRTC: Receiver - Local description (answer) set successfully');

      socket.emit('answer_call', {
        to: incomingCall.from,
        signal: answer
      });

      // Process any buffered candidates that arrived while ringing
      console.log(`WebRTC: Processing ${bufferedIceCandidates.current.length} buffered ICE candidates in answerCall`);
      while (bufferedIceCandidates.current.length > 0) {
        const candidate = bufferedIceCandidates.current.shift();
        if (candidate && pc) {
          await pc.addIceCandidate(candidate);
        }
      }

      // Update call log record
      try {
        // If we have a callId shared via signal, use it, otherwise use targetId
        // In simple P2P without signaling server tracking, we rely on target/chat lookup
        // For now, update whatever we're joined to
      } catch (err) {
        console.error('Error updating join call log:', err);
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
      }
    }
  };

  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

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
      }
    });

    socket.on('call_accepted', async (data) => {
      console.log('WebRTC: Call accepted by remote peer');
      if (peerConnection.current) {
        try {
          const signal = data.signal || data;
          await peerConnection.current.setRemoteDescription(new RTCSessionDescription(signal));
          setCallActive(true);
          setIsCalling(false);
          
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
      setIncomingCall(data);
      if (data.callId) setCallId(data.callId);
    });

    socket.on('call_ended', () => {
      console.log('Remote peer ended the call');
      cleanup();
    });

    socket.on('call_error', (data: { message: string }) => {
      console.error('Call signaling error:', data.message);
      // We could use a toast here if available via context, for now alert/log
      alert(`Call failed: ${data.message}`);
      cleanup();
    });

    return () => {
      socket.off('incoming_call');
      socket.off('call_accepted');
      socket.off('call_signal');
      socket.off('call_ended');
      socket.off('call_error');
    };
  }, [socket, cleanup]);

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
      isAudioMuted,
      isVideoOff,
      callDuration,
      formatDuration
    }}>
      {children}
    </CallContext.Provider>
  );
};
