import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from '../context/CallContext';
import { useAuth } from '../context/AuthContext';

const CallOverlay: React.FC = () => {
  const { user } = useAuth();
  const {
    isCalling,
    incomingCall,
    callActive,
    localStream,
    remoteStream,
    callType,
    remoteUser,
    answerCall,
    rejectCall,
    endCall,
    toggleAudio,
    toggleVideo,
    switchCamera,
    isMinimized,
    setIsMinimized,
    isAudioMuted,
    isVideoOff,
    callDuration,
    formatDuration,

    // WebRTC calling state variables
    callStatus,
    isRemoteMuted,
    isRemoteVideoOff,
    networkQuality,
    isSpeakerOff,
    toggleSpeaker,
    videoFilter,
    remoteVideoFilter,
    setLocalVideoFilter
  } = useCall();

  const [showControls, setShowControls] = useState(true);

  // Draggable PIP State and Refs
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [snappedCorner, setSnappedCorner] = useState<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'>('top-right');
  const pipRef = useRef<HTMLDivElement>(null);
  const dragStartOffset = useRef({ x: 0, y: 0 });
  const [showFilterName, setShowFilterName] = useState(false);

  const getCornerCoordinates = useCallback((
    corner: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    width: number,
    height: number
  ) => {
    const minX = 16;
    const maxX = window.innerWidth - width - 16;
    const minY = 96;
    const maxY = window.innerHeight - height - 140;

    switch (corner) {
      case 'top-left':
        return { x: minX, y: minY };
      case 'top-right':
        return { x: maxX, y: minY };
      case 'bottom-left':
        return { x: minX, y: maxY };
      case 'bottom-right':
        return { x: maxX, y: maxY };
      default:
        return { x: maxX, y: minY };
    }
  }, []);

  // Sync position on window resize
  useEffect(() => {
    if (position === null) return;
    
    const handleResize = () => {
      if (!pipRef.current) return;
      const rect = pipRef.current.getBoundingClientRect();
      const coords = getCornerCoordinates(snappedCorner, rect.width, rect.height);
      setPosition(coords);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [position, snappedCorner, getCornerCoordinates]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag with primary mouse button or touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    const pipElement = pipRef.current;
    if (!pipElement) return;

    try {
      pipElement.setPointerCapture(e.pointerId);
    } catch (err) {
      console.warn('Failed to set pointer capture:', err);
    }

    const rect = pipElement.getBoundingClientRect();
    
    dragStartOffset.current = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };

    setIsDragging(true);
    setPosition({ x: rect.left, y: rect.top });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const pipElement = pipRef.current;
    if (!pipElement) return;

    const rect = pipElement.getBoundingClientRect();

    const newX = e.clientX - dragStartOffset.current.x;
    const newY = e.clientY - dragStartOffset.current.y;

    const minX = 16;
    const maxX = window.innerWidth - rect.width - 16;
    const minY = 96;
    const maxY = window.innerHeight - rect.height - 140;

    const clampedX = Math.max(minX, Math.min(maxX, newX));
    const clampedY = Math.max(minY, Math.min(maxY, newY));

    setPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;

    const pipElement = pipRef.current;
    if (!pipElement) return;

    try {
      pipElement.releasePointerCapture(e.pointerId);
    } catch (err) {
      console.warn('Failed to release pointer capture:', err);
    }

    setIsDragging(false);

    const rect = pipElement.getBoundingClientRect();

    const minX = 16;
    const maxX = window.innerWidth - rect.width - 16;
    const minY = 96;
    const maxY = window.innerHeight - rect.height - 140;

    const currentX = position ? position.x : rect.left;
    const currentY = position ? position.y : rect.top;

    const corners = [
      { x: minX, y: minY, name: 'top-left' as const },
      { x: maxX, y: minY, name: 'top-right' as const },
      { x: minX, y: maxY, name: 'bottom-left' as const },
      { x: maxX, y: maxY, name: 'bottom-right' as const }
    ];

    let closestCorner = corners[1]; // default to top-right
    let minDistanceSq = Infinity;

    corners.forEach(corner => {
      const dx = currentX - corner.x;
      const dy = currentY - corner.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        closestCorner = corner;
      }
    });

    setPosition({ x: closestCorner.x, y: closestCorner.y });
    setSnappedCorner(closestCorner.name);
  };

  // Inline styling object for PIP wrapper
  const pipStyle: React.CSSProperties = {
    touchAction: 'none',
    cursor: isDragging ? 'grabbing' : 'grab',
    position: 'absolute',
    ...(position
      ? {
          left: `${position.x}px`,
          top: `${position.y}px`,
          right: 'auto',
          margin: 0,
          transition: isDragging
            ? 'none'
            : 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
        }
      : {
          top: '96px',
          right: '24px',
          transition: 'left 0.3s cubic-bezier(0.25, 1, 0.5, 1), top 0.3s cubic-bezier(0.25, 1, 0.5, 1)'
        })
  };

  // Auto-hide controls timer (Video call only)
  useEffect(() => {
    if (!callActive || callType !== 'video') {
      setShowControls(true);
      return;
    }

    let timer: NodeJS.Timeout;
    const resetTimer = () => {
      setShowControls(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        setShowControls(false);
      }, 3500); // Hide controls after 3.5 seconds of inactivity
    };

    // Add listeners
    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('touchstart', resetTimer);
    window.addEventListener('keydown', resetTimer);

    // Initialize timer
    resetTimer();

    return () => {
      clearTimeout(timer);
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('touchstart', resetTimer);
      window.removeEventListener('keydown', resetTimer);
    };
  }, [callActive, callType]);

  const localVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node && localStream) {
      if (node.srcObject !== localStream) {
        console.log('CallOverlay: Attaching local stream via callback ref', localStream.id);
        node.srcObject = localStream;
      }
      node.play().catch(e => {
        if (e.name !== 'AbortError') console.warn("Local video play failed:", e);
      });
    }
  }, [localStream]);

  const remoteVideoRef = useCallback((node: HTMLVideoElement | null) => {
    if (node && remoteStream) {
      if (node.srcObject !== remoteStream) {
        console.log('CallOverlay: Attaching remote stream via callback ref', remoteStream.id);
        node.srcObject = remoteStream;
      }
      node.play().catch(e => {
        if (e.name !== 'AbortError') console.error("Remote video play failed:", e);
      });
    }
  }, [remoteStream]);

  const outgoingAudioRef = useRef<HTMLAudioElement>(null);
  const incomingAudioRef = useRef<HTMLAudioElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);

  const remoteAudioRefCallback = useCallback((node: HTMLAudioElement | null) => {
    if (node) {
      remoteAudioRef.current = node;
      if (remoteStream) {
        if (node.srcObject !== remoteStream) {
          console.log('CallOverlay: Attaching remote audio stream via callback ref', remoteStream.id);
          node.srcObject = remoteStream;
        }
        node.play().catch(e => {
          if (e.name !== 'AbortError') console.error("Remote audio play failed:", e);
        });
      }
    }
  }, [remoteStream]);

  // Sound URLs (Standard calling/ringing tones)
  const OUTGOING_RING_URL = "https://assets.mixkit.co/active_storage/sfx/1358/1358-preview.mp3";
  const INCOMING_RING_URL = "https://assets.mixkit.co/active_storage/sfx/1359/1359-preview.mp3";

  // Handle ringing sounds
  useEffect(() => {
    const currentOutgoingAudio = outgoingAudioRef.current;
    const currentIncomingAudio = incomingAudioRef.current;

    // Handle Outgoing Ringing
    if (callStatus === 'calling' || callStatus === 'ringing') {
      if (currentOutgoingAudio && isCalling && !callActive) {
        currentOutgoingAudio.loop = true;
        currentOutgoingAudio.play().catch(e => {
          if (e.name !== 'NotAllowedError') console.error("WebRTC Audio: Outgoing playback error:", e);
        });
      }
    } else if (currentOutgoingAudio) {
      currentOutgoingAudio.pause();
      currentOutgoingAudio.currentTime = 0;
    }

    // Handle Incoming Ringing
    if (incomingCall && !callActive && callStatus === 'ringing') {
      if (currentIncomingAudio) {
        currentIncomingAudio.loop = true;
        currentIncomingAudio.play().catch(e => {
          if (e.name !== 'NotAllowedError') console.error("WebRTC Audio: Incoming playback error:", e);
        });
      }
    } else if (currentIncomingAudio) {
      currentIncomingAudio.pause();
      currentIncomingAudio.currentTime = 0;
    }

    return () => {
      if (currentOutgoingAudio) currentOutgoingAudio.pause();
      if (currentIncomingAudio) currentIncomingAudio.pause();
    };
  }, [isCalling, incomingCall, callActive, callStatus]);

  const displayUser = incomingCall ? {
    name: incomingCall.fromName,
    pic: incomingCall.fromPic
  } : {
    name: remoteUser?.displayName || remoteUser?.username || 'User',
    pic: remoteUser?.profilePic
  };

  const showRemoteAvatar = 
    !remoteStream || 
    remoteStream.getVideoTracks().length === 0 ||
    isRemoteVideoOff;

  const persistentAudio = (
    <>
      <audio ref={outgoingAudioRef} src={OUTGOING_RING_URL} preload="auto" />
      <audio ref={incomingAudioRef} src={INCOMING_RING_URL} preload="auto" />
    </>
  );

  const isVideoCall = callType === 'video' || (incomingCall && incomingCall.type === 'video');
  const showPip = isVideoCall && !isMinimized;

  const filterList = ['none', 'cyberpunk', 'vintage', 'noir', 'warm', 'cool'];

  const getCssFilter = (filterName: string) => {
    switch (filterName) {
      case 'cyberpunk':
        return 'hue-rotate(180deg) saturate(1.6) contrast(1.2) brightness(0.95)';
      case 'vintage':
        return 'sepia(0.65) contrast(1.15) brightness(0.95) saturate(0.95)';
      case 'noir':
        return 'grayscale(1) contrast(1.45) brightness(0.95)';
      case 'warm':
        return 'sepia(0.3) saturate(1.4) hue-rotate(-10deg) contrast(1.1)';
      case 'cool':
        return 'saturate(1.15) hue-rotate(15deg) brightness(1.05) contrast(0.95)';
      default:
        return 'none';
    }
  };

  const cycleFilter = (e: React.MouseEvent) => {
    e.stopPropagation(); // prevent drag
    const currentIndex = filterList.indexOf(videoFilter);
    const nextIndex = (currentIndex + 1) % filterList.length;
    setLocalVideoFilter(filterList[nextIndex]);
  };

  useEffect(() => {
    if (videoFilter === 'none') return;
    setShowFilterName(true);
    const t = setTimeout(() => setShowFilterName(false), 1200);
    return () => clearTimeout(t);
  }, [videoFilter]);

  if (!isCalling && !incomingCall && !callActive && callStatus !== 'ended') return persistentAudio;

  // Minimized Mode (Floating window)
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-[200] w-40 h-56 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-slate-950 flex flex-col group animate-fade-in ring-1 ring-white/10">
        {persistentAudio}
        
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {!showRemoteAvatar && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted={true}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center space-y-2">
              <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-lg font-bold text-white shadow-md overflow-hidden relative border border-white/10">
                {displayUser.pic ? (
                  <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                ) : (
                  displayUser.name.charAt(0).toUpperCase()
                )}
              </div>
              <p className="text-[10px] text-white/90 font-bold truncate max-w-[100px]">{displayUser.name}</p>
            </div>
          )}
        </div>

        {/* Mini Hover Control Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1 rounded-lg bg-black/40 hover:bg-black/80 text-white transition-all"
              title="Maximize"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4h6v6M20 20h-6v-6M4 20l6-6M20 4l-6 6" />
              </svg>
            </button>
            <span className="text-[9px] font-mono text-white bg-black/40 px-1.5 py-0.5 rounded-full">
              {formatDuration(callDuration)}
            </span>
          </div>
          
          <div className="flex justify-center space-x-2">
            <button
              onClick={toggleAudio}
              className={`p-1.5 rounded-full transition-all ${isAudioMuted ? 'bg-red-500 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            <button
              onClick={endCall}
              className="p-1.5 rounded-full bg-red-600 hover:bg-red-700 text-white"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l-8 8m0-8l8 8" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="call-container" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 text-white select-none overflow-hidden font-sans">
      {persistentAudio}

      {/* Hidden remote audio element to ensure audio track plays independently of video */}
      <audio
        ref={remoteAudioRefCallback}
        autoPlay
        playsInline
        id="remoteAudio"
        muted={isSpeakerOff}
      />

      {/* Embedded CSS for animations */}
      <style>{`
        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.15); opacity: 0.4; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .mirror {
          transform: scaleX(-1);
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateY(4px); }
          15% { opacity: 1; transform: translateY(0); }
          85% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-4px); }
        }
        .animate-fade-in-out {
          animation: fadeInOut 1.2s ease-in-out forwards;
        }
      `}</style>

      {/* Incoming Call Screen */}
      {incomingCall && !callActive && (
        <div className="relative z-10 w-full h-full flex flex-col justify-between items-center p-8 bg-slate-950 select-none overflow-hidden">
          {/* Blurred Background profile image */}
          {displayUser.pic ? (
            <div className="absolute inset-0 scale-125 blur-3xl opacity-20 pointer-events-none">
              <img src={displayUser.pic} alt="Background Blur" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-slate-950 to-emerald-950/20 blur-3xl opacity-30 pointer-events-none"></div>
          )}

          {/* Caller Details */}
          <div className="flex flex-col items-center mt-24 space-y-4 z-10">
            <div className="relative w-28 h-28 md:w-36 md:h-36">
              <div className="absolute inset-0 rounded-full bg-primary-500 animate-ping opacity-25 animate-duration-2000 pointer-events-none"></div>
              <div className="relative rounded-full bg-slate-800 w-full h-full flex items-center justify-center text-4xl font-bold text-primary-400 shadow-2xl overflow-hidden ring-4 ring-white/10">
                {displayUser.pic ? (
                  <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                ) : (
                  displayUser.name.charAt(0).toUpperCase()
                )}
              </div>
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-3xl font-extrabold text-white tracking-wide">{displayUser.name}</h3>
              <p className="text-primary-400 text-sm font-semibold tracking-widest uppercase animate-pulse">
                Incoming {incomingCall.type === 'video' ? 'Video' : 'Voice'} Call...
              </p>
            </div>
          </div>

          {/* Accept / Reject Buttons */}
          <div className="flex items-center justify-center space-x-12 mb-20 z-10">
            <button
              onClick={rejectCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 shadow-lg shadow-red-500/30"
              title="Decline"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={answerCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 flex items-center justify-center text-white transition-all transform hover:scale-110 active:scale-95 shadow-lg shadow-emerald-500/30"
              title="Accept"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Active Call / Calling Screen */}
      {(isCalling || callActive || callStatus === 'ended') && (
        <div className="relative w-full h-full flex flex-col bg-slate-950">
          
          {/* Header Bar */}
          <div className={`absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-30 transition-all duration-300 ${(!showControls && callType === 'video') ? '-translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'}`}>
            <button
              onClick={() => setIsMinimized(true)}
              className="p-2.5 rounded-full bg-slate-900/60 backdrop-blur border border-white/5 hover:bg-slate-800 text-white transition-all shadow-lg pointer-events-auto"
              title="Minimize Call"
            >
              {/* WhatsApp-style back arrow chevron */}
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            {/* Network Quality Indicator */}
            <div className="flex items-center space-x-2 bg-slate-900/60 backdrop-blur px-3 py-1.5 rounded-full border border-white/5 shadow-lg pointer-events-auto">
              <span className={`w-2 h-2 rounded-full ${networkQuality === 'excellent' ? 'bg-emerald-500' : networkQuality === 'good' ? 'bg-yellow-500' : networkQuality === 'poor' ? 'bg-rose-500' : 'bg-gray-400'} animate-pulse`}></span>
              <span className="text-[10px] font-bold text-white/90 uppercase tracking-wider">Secure Connection</span>
            </div>
          </div>

          {/* MAIN CALL CONTAINER */}
          {callType === 'video' ? (
            /* ==================== VIDEO CALL INTERFACE ==================== */
            <div className="flex-grow w-full h-full relative bg-black">
              {/* Full Screen Remote Video */}
              {!showRemoteAvatar ? (
                remoteStream && (
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    muted={true}
                    id="remoteVideo"
                    className="w-full h-full object-contain"
                    style={{ filter: getCssFilter(remoteVideoFilter) }}
                  />
                )
              ) : (
                /* Remote Avatar (when their camera is off) */
                <div className="w-full h-full flex flex-col items-center justify-center relative bg-slate-950">
                  {displayUser.pic && (
                    <div className="absolute inset-0 scale-125 blur-3xl opacity-20 pointer-events-none">
                      <img src={displayUser.pic} alt="Background" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="relative z-10 flex flex-col items-center space-y-4">
                    <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4 border-slate-700 overflow-hidden">
                      {displayUser.pic ? (
                        <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                      ) : (
                        displayUser.name.charAt(0).toUpperCase()
                      )}
                    </div>
                    <p className="text-sm font-semibold text-white/70">Video turned off</p>
                  </div>
                </div>
              )}

              {/* Remote Mute Indicator overlay */}
              {isRemoteMuted && (
                <div className="absolute bottom-28 left-6 z-30 bg-rose-600/80 backdrop-blur px-3 py-1.5 rounded-full border border-rose-500/20 text-white text-xs font-semibold flex items-center space-x-1.5">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  <span>Muted</span>
                </div>
              )}
            </div>
          ) : (
            /* ==================== AUDIO CALL INTERFACE ==================== */
            <div className="flex-grow w-full h-full flex flex-col items-center justify-center relative bg-slate-950 overflow-hidden p-6">
              {/* Blurred backdrop using user image */}
              {displayUser.pic ? (
                <div className="absolute inset-0 scale-125 blur-3xl opacity-20 pointer-events-none">
                  <img src={displayUser.pic} alt="Background" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-slate-950 to-emerald-950/20 blur-3xl opacity-30 pointer-events-none"></div>
              )}

              {/* Pulsing Avatar in the middle */}
              <div className="relative flex items-center justify-center w-64 h-64 z-10">
                {callStatus === 'ringing' || callStatus === 'connecting' || callStatus === 'reconnecting' ? (
                  <>
                    <div className="absolute inset-0 rounded-full border border-primary-500 bg-primary-500/10 pointer-events-none" style={{ animation: 'pulseRing 3s linear infinite' }}></div>
                    <div className="absolute inset-0 rounded-full border border-primary-500 bg-primary-500/5 pointer-events-none" style={{ animation: 'pulseRing 3s linear infinite', animationDelay: '1.5s' }}></div>
                  </>
                ) : null}
                <div className="w-36 h-36 rounded-full bg-slate-800 flex items-center justify-center text-6xl font-bold text-white shadow-2xl border-4 border-slate-700 overflow-hidden">
                  {displayUser.pic ? (
                    <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                  ) : (
                    displayUser.name.charAt(0).toUpperCase()
                  )}
                </div>
              </div>

              {/* Call Details below Avatar */}
              <div className="mt-8 text-center space-y-2 z-10 font-sans">
                <h3 className="text-2xl font-bold text-white tracking-wide">{displayUser.name}</h3>
                <p className="text-sm font-semibold tracking-wider text-primary-400 uppercase">
                  {callStatus === 'calling' && 'Calling...'}
                  {callStatus === 'ringing' && 'Ringing...'}
                  {callStatus === 'connecting' && 'Connecting...'}
                  {callStatus === 'connected' && formatDuration(callDuration)}
                  {callStatus === 'reconnecting' && 'Reconnecting...'}
                  {callStatus === 'ended' && 'Call Ended'}
                </p>
                {isRemoteMuted && (
                  <span className="inline-block mt-3 bg-rose-500/20 text-rose-400 px-3 py-1 rounded-xl text-xs font-semibold border border-rose-500/10">
                    Muted
                  </span>
                )}
              </div>
            </div>
          )}

          {/* BOTTOM CONTROLS PANEL */}
          <div className={`absolute bottom-0 left-0 right-0 p-8 pb-12 flex flex-col items-center bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent z-40 transition-all duration-300 ${(!showControls && callType === 'video') ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100 pointer-events-auto'}`}>
            
            {callType === 'video' ? (
              /* Video Call Controls (5 Buttons) */
              <div className="flex items-center space-x-4 px-6 py-4 rounded-3xl bg-slate-900/60 backdrop-blur-2xl border border-white/5 shadow-2xl">
                
                {/* Speaker Switch */}
                <button
                  onClick={toggleSpeaker}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isSpeakerOff ? 'bg-slate-800 text-white/50 border border-white/5' : 'bg-primary-500 text-white'}`}
                  title={isSpeakerOff ? "Turn Speaker On" : "Turn Speaker Off"}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>

                {/* Switch Camera */}
                <button
                  onClick={switchCamera}
                  className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-white border border-white/5 transition-all"
                  title="Switch Camera"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                </button>

                {/* Video Camera Toggle */}
                <button
                  onClick={toggleVideo}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isVideoOff ? 'bg-rose-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
                >
                  {isVideoOff ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zm10-10l6 6m0-6l-6 6" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  )}
                </button>

                {/* Mic Mute Toggle */}
                <button
                  onClick={toggleAudio}
                  className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${isAudioMuted ? 'bg-rose-500 text-white' : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isAudioMuted ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  )}
                </button>

                {/* End Call (Video) */}
                <button
                  onClick={endCall}
                  className="w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-lg transform active:scale-95"
                  title="End Call"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l-8 8m0-8l8 8" />
                  </svg>
                </button>

              </div>
            ) : (
              /* Audio Call Controls (3 Buttons) */
              <div className="flex items-center space-x-6 px-8 py-4 rounded-3xl bg-slate-900/60 backdrop-blur-2xl border border-white/5 shadow-2xl">
                
                {/* Speaker Toggle */}
                <button
                  onClick={toggleSpeaker}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all transform active:scale-95 ${isSpeakerOff ? 'bg-slate-800 text-white/50 border border-white/5' : 'bg-primary-500 text-white shadow-lg shadow-primary-500/20'}`}
                  title={isSpeakerOff ? "Turn Speaker On" : "Turn Speaker Off"}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                </button>

                {/* Mic Mute Toggle */}
                <button
                  onClick={toggleAudio}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all transform active:scale-95 ${isAudioMuted ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-800 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
                >
                  {isAudioMuted ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  )}
                </button>

                {/* End Call (Audio) */}
                <button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white flex items-center justify-center shadow-xl transform hover:scale-110 active:scale-95 shadow-rose-600/35"
                  title="End Call"
                >
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l-8 8m0-8l8 8" />
                  </svg>
                </button>

              </div>
            )}

          </div>
        </div>
      )}

      {/* Local Video floating PIP (Draggable Picture-in-Picture) */}
      {showPip && (
        <div
          ref={pipRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          style={pipStyle}
          className="w-[100px] h-[140px] sm:w-[120px] sm:h-[170px] md:w-[180px] md:h-[240px] rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-slate-900 z-50 select-none touch-none group"
        >
          {/* Floating Filter Button (Magic Wand) */}
          {!isVideoOff && localStream && (
            <button
              onClick={cycleFilter}
              className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black/80 hover:scale-105 active:scale-95 text-white transition-all flex items-center justify-center pointer-events-auto shadow-md opacity-0 group-hover:opacity-100 touch-none"
              title={`Cycle Filter: ${videoFilter}`}
            >
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 9.172V5L8 4z" />
              </svg>
            </button>
          )}

          {showFilterName && (
            <div className="absolute inset-x-0 bottom-2 z-30 flex justify-center pointer-events-none animate-fade-in-out">
              <span className="bg-black/85 backdrop-blur px-2 py-0.5 rounded-full text-[8px] sm:text-[9px] font-bold text-white uppercase tracking-wider border border-white/10 shadow-lg">
                {videoFilter}
              </span>
            </div>
          )}

          {(!localStream || isVideoOff) ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white/50 space-y-1">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-slate-700 flex items-center justify-center text-xs sm:text-sm font-bold text-white overflow-hidden">
                {user?.displayName?.charAt(0).toUpperCase() || user?.username?.charAt(0).toUpperCase() || 'Me'}
              </div>
              <span className="text-[8px] sm:text-[10px] font-semibold">Camera Off</span>
            </div>
          ) : (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              id="localVideo"
              className="w-full h-full object-cover mirror pointer-events-none"
              style={{ filter: getCssFilter(videoFilter) }}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default CallOverlay;
