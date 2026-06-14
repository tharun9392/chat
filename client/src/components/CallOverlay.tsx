import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCall } from '../context/CallContext';

const CallOverlay: React.FC = () => {
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

    // New symmetric variables and functions
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
    toggleSpeaker
  } = useCall();

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

  const [showEmojiMenu, setShowEmojiMenu] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [isLocalBlurred, setIsLocalBlurred] = useState(false);

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

  const toggleFullscreen = () => {
    const container = document.getElementById('call-container');
    if (container) {
      if (!document.fullscreenElement) {
        container.requestFullscreen().catch(err => console.error('Fullscreen failed:', err));
      } else {
        document.exitFullscreen();
      }
    }
  };

  const persistentAudio = (
    <>
      <audio ref={outgoingAudioRef} src={OUTGOING_RING_URL} preload="auto" />
      <audio ref={incomingAudioRef} src={INCOMING_RING_URL} preload="auto" />
    </>
  );

  if (!isCalling && !incomingCall && !callActive && callStatus !== 'ended') return persistentAudio;

  // Render floating reaction emoji
  const renderReaction = () => {
    if (!activeReaction) return null;
    return (
      <div 
        key={activeReaction.id}
        className="absolute bottom-36 left-1/2 -translate-x-1/2 pointer-events-none z-50 text-7xl select-none"
        style={{
          animation: 'floatUp 2.5s cubic-bezier(0.25, 1, 0.50, 1) forwards'
        }}
      >
        {activeReaction.emoji}
      </div>
    );
  };

  // Minimized Mode (Floating window)
  if (isMinimized) {
    return (
      <div className="fixed bottom-6 right-6 z-[200] w-56 h-76 rounded-3xl overflow-hidden shadow-2xl border border-white/10 bg-slate-950 flex flex-col group animate-fade-in ring-1 ring-white/10">
        {persistentAudio}
        
        {/* Minimized Content Display */}
        <div className="flex-1 relative bg-black flex items-center justify-center">
          {!showRemoteAvatar && remoteStream ? (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-xl font-bold text-white shadow-md overflow-hidden relative border border-white/10">
                {displayUser.pic ? (
                  <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                ) : (
                  displayUser.name.charAt(0).toUpperCase()
                )}
                {isRemoteMuted && (
                  <div className="absolute bottom-0 right-0 bg-rose-500 p-1 rounded-full text-white ring-1 ring-white">
                    <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24"><path d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                )}
              </div>
              <p className="text-xs text-white/90 font-bold truncate max-w-[150px]">{displayUser.name}</p>
            </div>
          )}
          
          {/* Mini local preview */}
          {callType === 'video' && !isVideoOff && localStream && (
            <div className="absolute top-2 right-2 w-16 h-24 rounded-xl overflow-hidden border border-white/20 shadow-lg">
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className={`w-full h-full object-cover mirror ${isLocalBlurred ? 'blur-sm' : ''}`}
              />
            </div>
          )}
        </div>

        {/* Mini Hover Control Overlay */}
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-3">
          <div className="flex justify-between items-center">
            <button
              onClick={() => setIsMinimized(false)}
              className="p-1.5 rounded-xl bg-black/40 hover:bg-black/80 text-white transition-all border border-white/5"
              title="Maximize"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4h6v6M20 20h-6v-6M4 20l6-6M20 4l-6 6" />
              </svg>
            </button>
            <span className="text-[10px] font-mono text-white bg-black/40 px-2 py-0.5 rounded-full border border-white/5">
              {formatDuration(callDuration)}
            </span>
          </div>
          
          <div className="flex justify-center space-x-3">
            <button
              onClick={toggleAudio}
              className={`p-2 rounded-full transition-all ${isAudioMuted ? 'bg-red-500 text-white' : 'bg-white/20 hover:bg-white/40 text-white'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </button>
            <button
              onClick={endCall}
              className="p-2 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-lg"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l-8 8m0-8l8 8" /></svg>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Helper to render network indicator
  const renderNetworkIndicator = () => {
    let color = 'bg-gray-400';
    let label = 'Unknown';
    if (networkQuality === 'excellent') { color = 'bg-emerald-500'; label = 'Excellent'; }
    else if (networkQuality === 'good') { color = 'bg-yellow-500'; label = 'Good'; }
    else if (networkQuality === 'poor') { color = 'bg-rose-500'; label = 'Poor'; }

    return (
      <div className="flex items-center space-x-2 bg-slate-800/40 backdrop-blur px-3 py-1.5 rounded-full border border-white/5">
        <span className={`w-2.5 h-2.5 rounded-full ${color} animate-pulse`}></span>
        <span className="text-xs font-semibold tracking-wide text-white/90">Net: {label}</span>
      </div>
    );
  };

  return (
    <div id="call-container" className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950 text-white select-none overflow-hidden font-sans">
      {persistentAudio}
      {renderReaction()}

      {/* Embedded CSS for animations */}
      <style>{`
        @keyframes floatUp {
          0% {
            transform: translate(-50%, 0) scale(0.4) rotate(0deg);
            opacity: 0;
          }
          15% {
            transform: translate(-50%, -40px) scale(1.3) rotate(-15deg);
            opacity: 1;
          }
          30% {
            transform: translate(-50%, -80px) scale(1.1) rotate(15deg);
          }
          85% {
            opacity: 0.9;
          }
          100% {
            transform: translate(-50%, -400px) scale(0.9) rotate(0deg);
            opacity: 0;
          }
        }
        @keyframes pulseRing {
          0% { transform: scale(0.95); opacity: 0.7; }
          50% { transform: scale(1.15); opacity: 0.4; }
          100% { transform: scale(1.35); opacity: 0; }
        }
        .mirror {
          transform: scaleX(-1);
        }
      `}</style>

      {/* Incoming Call Screen */}
      {incomingCall && !callActive && (
        <div className="relative z-10 p-8 max-w-sm w-full text-center space-y-8 animate-slide-up bg-slate-900/60 backdrop-blur-2xl border border-white/10 rounded-[32px] shadow-2xl ring-1 ring-white/10">
          <div className="relative mx-auto w-28 h-28">
            <div className="absolute inset-0 rounded-full bg-primary-500 animate-ping opacity-20"></div>
            <div className="relative rounded-full bg-slate-800 w-28 h-28 flex items-center justify-center text-4xl font-bold text-primary-400 shadow-xl overflow-hidden ring-4 ring-primary-500/20">
              {displayUser.pic ? (
                <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
              ) : (
                displayUser.name.charAt(0).toUpperCase()
              )}
            </div>
          </div>
          <div>
            <h3 className="text-2xl font-bold text-white tracking-wide mb-2">{displayUser.name}</h3>
            <p className="text-primary-400 text-sm font-semibold tracking-wider uppercase animate-pulse">Incoming {incomingCall.type} call...</p>
          </div>
          <div className="flex items-center justify-center space-x-6">
            <button
              onClick={rejectCall}
              className="p-5 rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-all transform hover:scale-115 active:scale-95 shadow-lg shadow-rose-500/25"
              title="Decline"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l-8 8m0-8l8 8" /></svg>
            </button>
            <button
              onClick={answerCall}
              className="p-5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 transition-all transform hover:scale-115 active:scale-95 shadow-lg shadow-emerald-500/25"
              title="Accept"
            >
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7" /></svg>
            </button>
          </div>
        </div>
      )}

      {/* Active Call / Calling Screen */}
      {(isCalling || callActive || callStatus === 'ended') && (
        <div className="relative w-full h-full flex flex-col bg-slate-950">
          
          {/* Header Bar */}
          <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-30 pointer-events-none">
            {/* Left Header Info */}
            <div className="pointer-events-auto flex items-center space-x-4 bg-slate-900/60 backdrop-blur px-4 py-2 rounded-2xl border border-white/5 shadow-lg">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 rounded-lg hover:bg-white/10 text-white transition-colors"
                title="Minimize Call"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <div className="h-6 w-[1px] bg-white/10"></div>
              <div>
                <p className="text-sm font-bold text-white tracking-wide truncate max-w-[140px]">{displayUser.name}</p>
                <div className="flex items-center space-x-1.5">
                  <span className="text-[10px] font-semibold text-white/60 tracking-wider uppercase">
                    {callStatus === 'calling' && 'Calling...'}
                    {callStatus === 'ringing' && 'Ringing...'}
                    {callStatus === 'connecting' && 'Connecting...'}
                    {callStatus === 'connected' && formatDuration(callDuration)}
                    {callStatus === 'reconnecting' && 'Reconnecting...'}
                    {callStatus === 'ended' && 'Call Ended'}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Header Controls */}
            <div className="pointer-events-auto flex items-center space-x-3">
              {renderNetworkIndicator()}
              <button
                onClick={toggleFullscreen}
                className="p-3.5 rounded-2xl bg-slate-900/60 backdrop-blur border border-white/5 hover:bg-slate-800 text-white transition-all shadow-lg"
                title="Fullscreen Toggle"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Main Visual Window */}
          <div className="flex-1 relative flex items-center justify-center">
            
            {/* REMOTE VIDEO FRAME OR AVATAR */}
            {callType === 'video' ? (
              <div className="w-full h-full relative flex items-center justify-center bg-black">
                {/* Visualizer and backdrop for camera privacy */}
                {showRemoteAvatar ? (
                  <div className="w-full h-full flex flex-col items-center justify-center relative bg-slate-950 overflow-hidden">
                    {/* Blurred background profile image */}
                    {displayUser.pic ? (
                      <div className="absolute inset-0 scale-125 blur-3xl opacity-20 pointer-events-none">
                        <img src={displayUser.pic} alt="Background" className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/20 via-slate-950 to-emerald-950/20 blur-3xl opacity-30"></div>
                    )}
                    
                    {/* Central Avatar */}
                    <div className="relative z-10 flex flex-col items-center space-y-4">
                      <div className="w-32 h-32 rounded-full bg-slate-800 flex items-center justify-center text-4xl font-bold text-white shadow-2xl border-4 border-slate-700 relative overflow-hidden">
                        {displayUser.pic ? (
                          <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                        ) : (
                          displayUser.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="bg-slate-900/80 backdrop-blur border border-white/10 px-4 py-2 rounded-2xl flex items-center space-x-2">
                        <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs text-white/90 font-medium">Camera is off</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  remoteStream && (
                    <video
                      ref={remoteVideoRef}
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                  )
                )}

                {/* Remote Mute Overlay Indicator */}
                {isRemoteMuted && (
                  <div className="absolute bottom-6 left-6 z-10 bg-rose-500/80 backdrop-blur text-white px-3 py-1.5 rounded-xl border border-rose-400/20 flex items-center space-x-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" /></svg>
                    <span className="text-xs font-semibold tracking-wide">User Muted</span>
                  </div>
                )}

                {/* Remote Screen Sharing Badge */}
                {isRemoteScreenSharing && (
                  <div className="absolute bottom-6 left-6 z-10 bg-primary-600/95 backdrop-blur text-white px-4 py-2 rounded-xl flex items-center space-x-2 border border-primary-500/30">
                    <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span className="text-xs font-semibold">Viewing shared screen</span>
                  </div>
                )}
              </div>
            ) : (
              /* AUDIO CALL VISUALIZER (Premium pulsing rings) */
              <div className="w-full h-full flex flex-col items-center justify-center relative bg-slate-950 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-tr from-indigo-950/20 via-slate-950 to-primary-950/20 opacity-30"></div>
                
                {/* Profile Avatar with pulsing rings */}
                <div className="relative flex items-center justify-center w-64 h-64">
                  {callStatus === 'ringing' || callStatus === 'connecting' || callStatus === 'reconnecting' ? (
                    <>
                      <div className="absolute inset-0 rounded-full border border-primary-500 bg-primary-500/10 pointer-events-none" style={{ animation: 'pulseRing 3s linear infinite' }}></div>
                      <div className="absolute inset-0 rounded-full border border-primary-500 bg-primary-500/5 pointer-events-none" style={{ animation: 'pulseRing 3s linear infinite', animationDelay: '1.5s' }}></div>
                    </>
                  ) : null}
                  
                  <div className="relative w-36 h-36 rounded-full bg-slate-800 flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4 border-slate-700 relative overflow-hidden">
                    {displayUser.pic ? (
                      <img src={displayUser.pic} alt={displayUser.name} className="w-full h-full object-cover" />
                    ) : (
                      displayUser.name.charAt(0).toUpperCase()
                    )}
                  </div>
                </div>

                <h3 className="mt-8 text-2xl font-bold text-white">{displayUser.name}</h3>
                
                {/* Audio Status Notifications */}
                <div className="mt-4 flex flex-col items-center">
                  <span className="bg-slate-900/60 border border-white/5 px-4 py-1.5 rounded-full text-xs font-bold text-primary-400 tracking-widest uppercase animate-pulse">
                    {callStatus === 'calling' && 'Calling...'}
                    {callStatus === 'ringing' && 'Ringing...'}
                    {callStatus === 'connecting' && 'Connecting audio...'}
                    {callStatus === 'connected' && 'Connected'}
                    {callStatus === 'reconnecting' && 'Reconnecting...'}
                    {callStatus === 'ended' && 'Call Ended'}
                  </span>
                  {isRemoteMuted && (
                    <span className="mt-3 bg-rose-500/20 text-rose-400 px-3 py-1 rounded-xl text-xs font-semibold flex items-center space-x-1.5 border border-rose-500/10">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                      <span>Remote user is muted</span>
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* LOCAL PICTURE-IN-PICTURE PREVIEW (Video Calls only) */}
            {callType === 'video' && (
              <div className="absolute top-24 right-8 w-44 h-60 rounded-[24px] overflow-hidden shadow-2xl border-2 border-white/10 glass-panel bg-slate-900/50 animate-slide-left z-25 group-hover:scale-105 transition-transform duration-300">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  id="localVideo"
                  className={`w-full h-full object-cover mirror ${isVideoOff ? 'hidden' : 'block'} ${isLocalBlurred ? 'blur-md' : ''}`}
                />
                {isVideoOff && (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-900/90 backdrop-blur-sm space-y-2 p-4 text-center">
                    <svg className="w-8 h-8 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2zm10-10l6 6m0-6l-6 6" /></svg>
                    <span className="text-[10px] text-white/50 font-medium">Your camera is off</span>
                  </div>
                )}
                {isScreenSharing && (
                  <div className="absolute inset-0 bg-primary-600/90 flex flex-col items-center justify-center p-3 text-center space-y-2">
                    <svg className="w-8 h-8 text-white animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                    <span className="text-[10px] font-bold">Sharing screen</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Control Bar Overlay */}
          <div className="p-8 pb-12 flex flex-col items-center bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent absolute bottom-0 left-0 right-0 z-40">
            
            {/* Audio Output Selector Pop-up Menu */}
            {showDeviceMenu && audioDevices.length > 0 && (
              <div className="mb-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 w-72 shadow-2xl animate-fade-in flex flex-col space-y-2 text-left">
                <p className="text-white/60 text-xs font-bold px-1.5 uppercase tracking-wider mb-1">Speaker Destination</p>
                {audioDevices.map(device => (
                  <button
                    key={device.deviceId}
                    onClick={() => {
                      changeAudioOutput(device.deviceId);
                      setShowDeviceMenu(false);
                    }}
                    className={`w-full p-3 rounded-xl text-left truncate transition-all text-xs font-medium flex items-center space-x-2 border ${selectedAudioDevice === device.deviceId ? 'bg-primary-500/20 border-primary-500/40 text-primary-300' : 'bg-transparent border-transparent hover:bg-white/5 text-white/95'}`}
                  >
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                    <span className="truncate">{device.label || `Speaker ${device.deviceId.substring(0, 6)}...`}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Reaction Pop-up Emoji Bar */}
            {showEmojiMenu && (
              <div className="mb-4 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl p-3 flex space-x-3.5 shadow-2xl animate-fade-in">
                {['👍', '❤️', '😂', '😮', '😢', '🎉'].map(emoji => (
                  <button
                    key={emoji}
                    onClick={() => {
                      sendReaction(emoji);
                      setShowEmojiMenu(false);
                    }}
                    className="text-3xl hover:scale-130 transition-transform duration-200 active:scale-95 duration-100"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            )}

            {/* Main Interactive Controls Grid */}
            <div className="flex items-center space-x-4 px-6 py-4 rounded-3xl bg-slate-900/60 backdrop-blur-2xl border border-white/5 shadow-2xl ring-1 ring-white/5">
              
              {/* Mic Control Button */}
              <button
                onClick={toggleAudio}
                className={`p-4 rounded-2xl transition-all duration-300 transform active:scale-95 ${isAudioMuted ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 ring-2 ring-rose-500/20' : 'bg-slate-800/80 hover:bg-slate-700 text-white border border-white/5'}`}
                title={isAudioMuted ? "Unmute Microphone" : "Mute Microphone"}
              >
                {isAudioMuted ? (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3l18 18" /></svg>
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                )}
              </button>

              {/* Camera Toggle Button (Video Calls only) */}
              {callType === 'video' && (
                <button
                  onClick={toggleVideo}
                  className={`p-4 rounded-2xl transition-all duration-300 transform active:scale-95 ${isVideoOff ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 ring-2 ring-rose-500/20' : 'bg-slate-800/80 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isVideoOff ? "Turn Camera On" : "Turn Camera Off"}
                >
                  {isVideoOff ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                  )}
                </button>
              )}

              {/* Screen Sharing Toggle Button */}
              {callType === 'video' && (
                <button
                  onClick={isScreenSharing ? stopScreenShare : startScreenShare}
                  className={`p-4 rounded-2xl transition-all duration-300 transform active:scale-95 ${isScreenSharing ? 'bg-primary-600 text-white shadow-lg' : 'bg-slate-800/80 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isScreenSharing ? "Stop Sharing Screen" : "Share Screen"}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </button>
              )}

              {/* Camera Switcher Button (Mobile/Video calls only) */}
              {callType === 'video' && !isVideoOff && (
                <button
                  onClick={switchCamera}
                  className="p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700 border border-white/5 text-white transition-all transform active:scale-95"
                  title="Switch Camera (Front/Rear)"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              )}

              {/* Camera Blur/Privacy Toggle Button (Video calls only) */}
              {callType === 'video' && !isVideoOff && (
                <button
                  onClick={() => setIsLocalBlurred(prev => !prev)}
                  className={`p-4 rounded-2xl transition-all duration-300 transform active:scale-95 ${isLocalBlurred ? 'bg-primary-600 text-white shadow-lg' : 'bg-slate-800/80 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isLocalBlurred ? "Remove Camera Blur" : "Blur My Background"}
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </button>
              )}

              {/* Speaker Toggle and Audio Device Menu */}
              <div className="relative">
                <button
                  onClick={() => {
                    if (audioDevices.length > 0) {
                      setShowDeviceMenu(prev => !prev);
                    } else {
                      toggleSpeaker();
                    }
                  }}
                  className={`p-4 rounded-2xl transition-all duration-300 transform active:scale-95 ${isSpeakerOff ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-800/80 hover:bg-slate-700 text-white border border-white/5'}`}
                  title={isSpeakerOff ? "Turn Speaker On" : "Speaker Settings / Speaker Off"}
                >
                  {isSpeakerOff ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 3l18 18" /></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" /></svg>
                  )}
                </button>
              </div>

              {/* Emoji Drawer Button */}
              <button
                onClick={() => setShowEmojiMenu(prev => !prev)}
                className={`p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-700 text-white border border-white/5 transition-all transform active:scale-95 ${showEmojiMenu ? 'bg-primary-600/40 text-primary-200' : ''}`}
                title="Send Emoji Reaction"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>

              {/* End Call Button */}
              <button
                onClick={endCall}
                className="p-4.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white transition-all transform hover:scale-110 active:scale-95 shadow-xl shadow-rose-600/30 ring-4 ring-rose-600/20"
                title="End Call"
              >
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 8l-8 8m0-8l8 8" />
                </svg>
              </button>

            </div>

            {/* Chat Notification Note */}
            <div className="mt-4 flex items-center justify-center space-x-1 opacity-60">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              <span className="text-[11px]">Minimize call to chat during the call</span>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};

export default CallOverlay;
