// Gemini Live Multimodal WebSocket Hook for Akki AI
// Reconstructed with 100% protocol fidelity from the legacy production app.
// Direct bidirectional audio PCM streaming via Google GenAI Live API (WebSocket).

import { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI } from '@google/genai';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';
import type { ChatMessage, ToolTrace } from '../../../shared/types';

// ── Audio Helpers from Legacy index-pSpzB4bE.js ──────────────────────────────

// Decodes base64 string to Uint8Array (legacy `is`)
function base64ToUint8(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Converts raw 16-bit linear PCM byte buffer to Web Audio AudioBuffer at 24000 Hz (legacy `Cs`)
function pcmToAudioBuffer(
  bytes: Uint8Array,
  audioCtx: AudioContext,
  sampleRate = 24000,
  numChannels = 1
): AudioBuffer {
  const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const frameCount = Math.floor(int16.length / numChannels);
  const audioBuffer = audioCtx.createBuffer(numChannels, frameCount, sampleRate);
  for (let ch = 0; ch < numChannels; ch++) {
    const channelData = audioBuffer.getChannelData(ch);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = int16[i * numChannels + ch] / 32768.0;
    }
  }
  return audioBuffer;
}

// Converts Float32 audio channel data from ScriptProcessor to 16-bit linear PCM base64 at 16000 Hz (legacy `Fy`)
function float32ToPcm16Base64(channelData: Float32Array): { data: string; mimeType: string } {
  const len = channelData.length;
  const int16 = new Int16Array(len);
  for (let i = 0; i < len; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    int16[i] = s < 0 ? s * 32768 : s * 32767;
  }
  const uint8 = new Uint8Array(int16.buffer);
  let binary = '';
  const byteLen = uint8.byteLength;
  for (let i = 0; i < byteLen; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  return {
    data: btoa(binary),
    mimeType: 'audio/pcm;rate=16000',
  };
}

export function useGeminiLive() {
  const {
    assistantStatus,
    setAssistantStatus,
    addMessage,
    setMessages,
    setIsStreaming,
    setCompanionSpeech,
    settings,
  } = useAppStore();

  const { playInit, playClick, playAction } = useAudio();

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio Context Refs
  const audioContextInputRef = useRef<AudioContext | null>(null);
  const audioContextOutputRef = useRef<AudioContext | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const outputAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveSessionRef = useRef<any>(null);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const nextStartTimeRef = useRef<number>(0);
  const isConnectingRef = useRef<boolean>(false);
  const liveAssistantMsgIdRef = useRef<string | null>(null);
  const liveAssistantTextRef = useRef<string>('');
  const liveUserTextRef = useRef<string>('');

  // Clean up all audio resources
  const cleanup = useCallback(() => {
    isConnectingRef.current = false;

    if (scriptProcessorRef.current) {
      try {
        scriptProcessorRef.current.disconnect();
      } catch {}
      scriptProcessorRef.current = null;
    }

    if (micStreamRef.current) {
      try {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      } catch {}
      micStreamRef.current = null;
    }

    activeSourcesRef.current.forEach((src) => {
      try {
        src.stop();
      } catch {}
    });
    activeSourcesRef.current.clear();
    nextStartTimeRef.current = 0;

    if (audioContextInputRef.current) {
      try {
        audioContextInputRef.current.close();
      } catch {}
      audioContextInputRef.current = null;
    }

    if (audioContextOutputRef.current) {
      try {
        audioContextOutputRef.current.close();
      } catch {}
      audioContextOutputRef.current = null;
    }

    if (liveSessionRef.current) {
      try {
        liveSessionRef.current.close();
      } catch {}
      liveSessionRef.current = null;
    }

    liveAssistantMsgIdRef.current = null;
    liveAssistantTextRef.current = '';
    liveUserTextRef.current = '';
    setIsStreaming(false);
  }, [setIsStreaming]);

  // Connect to Gemini Live Multimodal BiDi Session
  const connect = useCallback(async () => {
    if (isConnectingRef.current || liveSessionRef.current) return;
    isConnectingRef.current = true;
    setError(null);
    setAssistantStatus('thinking');

    try {
      // 1. Get Gemini API Key
      let apiKey = '';
      if ((window as any).electronAPI?.invoke) {
        apiKey = await (window as any).electronAPI.invoke('get-gemini-token');
      }
      if (!apiKey && settings.geminiApiKey) {
        apiKey = settings.geminiApiKey;
      }
      if (!apiKey) {
        throw new Error('Gemini API key required for direct voice mode. Add it in Settings > API.');
      }

      // 2. Initialize Audio Contexts
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const inputCtx = new AudioCtx({ sampleRate: 16000 });
      const outputCtx = new AudioCtx({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();

      audioContextInputRef.current = inputCtx;
      audioContextOutputRef.current = outputCtx;

      const outAnalyser = outputCtx.createAnalyser();
      outAnalyser.fftSize = 256;
      outAnalyser.connect(outputCtx.destination);
      outputAnalyserRef.current = outAnalyser;

      const inAnalyser = inputCtx.createAnalyser();
      inAnalyser.fftSize = 256;
      inputAnalyserRef.current = inAnalyser;

      // 3. Capture Microphone
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = micStream;
      if (window.__akkiIsMicMuted) {
        micStream.getAudioTracks().forEach((t) => (t.enabled = false));
      }

      // 4. Configure Voice & Model (legacy Charon / Despina presets)
      const selectedVoice =
        localStorage.getItem('GEMINI_VOICE_NAME') ||
        settings.selectedVoice ||
        'Charon';

      // Cultural System Instruction
      const userName = (settings.userName || 'Akshay').trim();
      const soulPrompt =
        settings.customSystemPrompt ||
        'You are Akki AI, a warm, highly intelligent, and loyal personal desktop AI companion pairing with Akshay. Respond warmly, concisely, and naturally in Hinglish/Hindi or English as preferred by the user.';

      const systemInstruction = `${soulPrompt}\nUser Profile: Name: ${userName}. You speak naturally in live conversational voice. Keep responses concise and engaging.`;

      // 5. Connect via GoogleGenAI Live Client
      const ai = new GoogleGenAI({ apiKey });
      const session = await ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: ['AUDIO' as any],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: selectedVoice,
              },
            },
          },
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          realtimeInputConfig: {
            automaticActivityDetection: {
              startOfSpeechSensitivity: 'START_SENSITIVITY_LOW' as any,
              endOfSpeechSensitivity: 'END_SENSITIVITY_HIGH' as any,
              silenceDurationMs: 800,
            },
          },
          systemInstruction: {
            parts: [{ text: systemInstruction }],
          },
        } as any,
        callbacks: {
          onmessage: async (msg: any) => {
            // Setup complete notification
            if (msg.setupComplete) {
              isConnectingRef.current = false;
              setAssistantStatus('listening');
              playInit();

              // Cultural Greeting on Cold Start (authentic legacy protocol)
              if (window.__akkiColdStart && !sessionStorage.getItem('__akkiGreetingSpoken')) {
                sessionStorage.setItem('__akkiGreetingSpoken', 'true');
                window.__akkiColdStart = false;

                const greetings = ['Radhe Radhe', 'Hare Krishna', 'Ram Ram', 'Namaste'];
                const g = greetings[Math.floor(Math.random() * greetings.length)];
                const firstName = userName.split(' ')[0];
                const userTag = firstName ? ' ' + firstName + ' ji' : '';
                const now = new Date();
                const h = now.getHours();
                const m = now.getMinutes();
                let period = 'subah';
                if (h >= 12 && h < 16) period = 'dopeher';
                else if (h >= 16 && h < 20) period = 'shaam';
                else if (h >= 20 || h < 4) period = 'raat';
                const h12 = h % 12 === 0 ? 12 : h % 12;
                const tStr = m === 0 ? `${period} ke ${h12} baje` : `${period} ke ${h12} bajke ${m} minute`;
                const greeting = `${g}${userTag}! Abhi ${tStr} ho rahe hain. Batayein aaj main aapki kya madad kar sakti hun?`;

                setTimeout(() => {
                  try {
                    session.sendClientContent({
                      turns: [
                        {
                          role: 'user',
                          parts: [{ text: `[COLD_SESSION_START] Speak immediately out loud: ${greeting}` }],
                        },
                      ],
                      turnComplete: true,
                    });
                  } catch (err) {
                    console.warn('[GeminiLive] Cold start greeting error:', err);
                  }
                }, 900);
              }
            }

            // Incoming Audio Playback (serverContent.modelTurn.parts)
            const parts = msg.serverContent?.modelTurn?.parts || [];
            let incomingTextDelta = '';

            for (const part of parts) {
              const inlineData = part?.inlineData;
              if (inlineData?.data && audioContextOutputRef.current) {
                setAssistantStatus('speaking');
                const outCtx = audioContextOutputRef.current;
                if (outCtx.state === 'suspended') {
                  await outCtx.resume();
                }

                nextStartTimeRef.current = Math.max(nextStartTimeRef.current, outCtx.currentTime);
                try {
                  const bytes = base64ToUint8(inlineData.data);
                  const audioBuffer = pcmToAudioBuffer(bytes, outCtx, 24000, 1);
                  const source = outCtx.createBufferSource();
                  source.buffer = audioBuffer;
                  source.connect(outputAnalyserRef.current || outCtx.destination);

                  source.addEventListener('ended', () => {
                    activeSourcesRef.current.delete(source);
                    if (activeSourcesRef.current.size === 0) {
                      setAssistantStatus('listening');
                    }
                  });

                  source.start(nextStartTimeRef.current);
                  nextStartTimeRef.current += audioBuffer.duration;
                  activeSourcesRef.current.add(source);
                } catch (playErr) {
                  console.error('[GeminiLive] Audio chunk play error:', playErr);
                }
              }

              // Text transcription updates from parts
              if (part?.text && !part.thought) {
                incomingTextDelta += part.text;
              }
            }

            // AI Output transcription (serverContent.outputTranscription.text)
            if (msg.serverContent?.outputTranscription?.text) {
              incomingTextDelta += msg.serverContent.outputTranscription.text;
            }

            // If there is incoming AI speech text, update both companion speech AND ChatDrawer message!
            if (incomingTextDelta) {
              if (!liveAssistantMsgIdRef.current) {
                liveAssistantMsgIdRef.current = `live-a-${Date.now()}`;
                liveAssistantTextRef.current = '';
                setIsStreaming(true);
              }
              liveAssistantTextRef.current += incomingTextDelta;
              const fullAssistantText = liveAssistantTextRef.current;

              // 1. Floating companion speech bubble over orb
              setCompanionSpeech(fullAssistantText);

              // 2. ChatDrawer message stream
              setMessages((prev) => {
                const targetId = liveAssistantMsgIdRef.current;
                const existingIdx = prev.findIndex((m) => m.id === targetId);
                if (existingIdx !== -1) {
                  const updated = [...prev];
                  updated[existingIdx] = {
                    ...updated[existingIdx],
                    content: fullAssistantText,
                  };
                  return updated;
                } else {
                  return [
                    ...prev,
                    {
                      id: targetId!,
                      sender: 'assistant',
                      avatarType: 'akki',
                      content: fullAssistantText,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    },
                  ];
                }
              });
            }

            // User audio transcription
            if (msg.serverContent?.inputTranscription?.text) {
              const userTranscript = msg.serverContent.inputTranscription.text;
              if (userTranscript) {
                liveUserTextRef.current += userTranscript;
              }
            }

            // Barge-in / Interruption handling
            if (msg.serverContent?.interrupted) {
              activeSourcesRef.current.forEach((src) => {
                try {
                  src.stop();
                } catch {}
              });
              activeSourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setAssistantStatus('listening');
              setIsStreaming(false);
              liveAssistantMsgIdRef.current = null;
              liveAssistantTextRef.current = '';
              liveUserTextRef.current = '';
            }

            // Turn Complete
            if (msg.serverContent?.turnComplete) {
              setIsStreaming(false);

              // If user transcript was collected during this turn, ensure user message is added
              const userSpeech = liveUserTextRef.current.trim();
              if (userSpeech) {
                setMessages((prev) => {
                  const alreadyPresent = prev.some(
                    (m) => m.sender === 'user' && m.content.trim() === userSpeech
                  );
                  if (alreadyPresent) return prev;
                  return [
                    ...prev,
                    {
                      id: `user-${Date.now()}`,
                      sender: 'user',
                      avatarType: 'user',
                      content: userSpeech,
                      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    },
                  ];
                });
                liveUserTextRef.current = '';
              }

              liveAssistantMsgIdRef.current = null;
              liveAssistantTextRef.current = '';
            }

            // Tool Calling dispatch with complete trace collection & ChatDrawer rendering
            if (msg.toolCall?.functionCalls) {
              const calls = Array.isArray(msg.toolCall.functionCalls)
                ? msg.toolCall.functionCalls
                : [];
              if (calls.length > 0) {
                if (!liveAssistantMsgIdRef.current) {
                  liveAssistantMsgIdRef.current = `msg_${Date.now()}`;
                }
                const currentMsgId = liveAssistantMsgIdRef.current;

                // Ensure assistant message card exists with toolCalls attached
                setMessages((prev) => {
                  const existing = prev.find((m) => m.id === currentMsgId);
                  if (existing) {
                    return prev.map((m) =>
                      m.id === currentMsgId
                        ? {
                            ...m,
                            toolCalls: [...(m.toolCalls || []), ...calls],
                            toolTraces: m.toolTraces || [],
                          }
                        : m
                    );
                  } else {
                    return [
                      ...prev,
                      {
                        id: currentMsgId,
                        sender: 'assistant',
                        avatarType: 'akki',
                        content: liveAssistantTextRef.current || '',
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                        toolCalls: calls,
                        toolTraces: [],
                      },
                    ];
                  }
                });

                const functionResponses: any[] = [];
                const newTraces: ToolTrace[] = [];

                for (const call of calls) {
                  const tStart = performance.now();
                  try {
                    let result: any = { success: true };
                    if ((window as any).electronAPI?.invoke) {
                      result = await (window as any).electronAPI.invoke('tools:execute', {
                        toolName: call.name,
                        args: call.args || {},
                      });
                    }
                    const durationMs = Math.round(performance.now() - tStart);
                    const isSuccess = result?.success !== false && !result?.error;

                    let outcome = '';
                    if (typeof result === 'string') {
                      outcome = result;
                    } else if (result?.output !== undefined) {
                      outcome = typeof result.output === 'object'
                        ? JSON.stringify(result.output, null, 2)
                        : String(result.output);
                    } else if (result?.result !== undefined) {
                      outcome = typeof result.result === 'object'
                        ? JSON.stringify(result.result, null, 2)
                        : String(result.result);
                    } else {
                      outcome = JSON.stringify(result, null, 2);
                    }

                    newTraces.push({
                      name: call.name,
                      success: isSuccess,
                      durationMs,
                      outcome,
                    });

                    functionResponses.push({
                      name: call.name,
                      id: call.id,
                      response: { result },
                    });
                  } catch (toolErr: any) {
                    const durationMs = Math.round(performance.now() - tStart);
                    newTraces.push({
                      name: call.name,
                      success: false,
                      durationMs,
                      outcome: toolErr.message || 'Tool execution error',
                    });
                    functionResponses.push({
                      name: call.name,
                      id: call.id,
                      response: { error: toolErr.message },
                    });
                  }
                }

                // Update messages state with completed traces so ToolTraceCard renders immediately
                if (newTraces.length > 0) {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === currentMsgId
                        ? {
                            ...m,
                            toolCalls: calls,
                            toolTraces: [...(m.toolTraces || []), ...newTraces],
                          }
                        : m
                    )
                  );
                }

                if (functionResponses.length > 0) {
                  try {
                    session.sendToolResponse({ functionResponses });
                  } catch (sendErr) {
                    console.warn('[GeminiLive] Tool response send error:', sendErr);
                  }
                }
              }
            }
          },
          onerror: (err: any) => {
            console.error('[GeminiLive] WebSocket Error:', err);
            setError(err.message || 'Live session error');
            cleanup();
            setAssistantStatus('standby');
          },
          onclose: (closeEv: any) => {
            console.log('[GeminiLive] WebSocket Closed:', closeEv);
            cleanup();
            setAssistantStatus('standby');
          },
        },
      });

      liveSessionRef.current = session;

      // 6. Connect ScriptProcessor Microphone Audio Stream
      const micSource = inputCtx.createMediaStreamSource(micStream);
      const scriptProcessor = inputCtx.createScriptProcessor(512, 1, 1);
      micSource.connect(inAnalyser);

      scriptProcessor.onaudioprocess = (e) => {
        if (
          window.__akkiIsMicMuted ||
          !liveSessionRef.current ||
          micStream.getAudioTracks().every((t) => !t.enabled)
        ) {
          return;
        }
        const channelData = e.inputBuffer.getChannelData(0);
        const pcm = float32ToPcm16Base64(channelData);
        try {
          liveSessionRef.current.sendRealtimeInput({ audio: pcm });
        } catch {}
      };

      micSource.connect(scriptProcessor);
      scriptProcessor.connect(inputCtx.destination);
      scriptProcessorRef.current = scriptProcessor;
    } catch (err: any) {
      console.error('[GeminiLive] Connection failure:', err);
      setError(err.message || 'Failed to connect to Live session');
      cleanup();
      setAssistantStatus('standby');
    }
  }, [settings, cleanup, setAssistantStatus, playInit, addMessage, setCompanionSpeech]);

  // Disconnect from Live session
  const disconnect = useCallback(() => {
    playAction();
    cleanup();
    setAssistantStatus('standby');
  }, [cleanup, playAction, setAssistantStatus]);

  // Toggle Microphone Mute (legacy toggleMic)
  const toggleMic = useCallback(() => {
    playClick();
    if (micStreamRef.current) {
      const tracks = micStreamRef.current.getAudioTracks();
      const newMuted = !isMicMuted;
      tracks.forEach((t) => (t.enabled = !newMuted));
      setIsMicMuted(newMuted);
      window.__akkiIsMicMuted = newMuted;
    } else {
      setIsMicMuted((prev) => {
        window.__akkiIsMicMuted = !prev;
        return !prev;
      });
    }
  }, [isMicMuted, playClick]);

  // Handle Start / Stop (Center Companion Orb click or Alt+V)
  const handleStartStop = useCallback(() => {
    if (assistantStatus === 'listening' || assistantStatus === 'speaking' || assistantStatus === 'thinking') {
      disconnect();
    } else {
      connect();
    }
  }, [assistantStatus, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    connect,
    disconnect,
    handleStartStop,
    toggleMic,
    isMicMuted,
    error,
    status: assistantStatus,
    isAISpeaking: assistantStatus === 'speaking',
  };
}

// Global declaration augmentation
declare global {
  interface Window {
    __akkiColdStart?: boolean;
    __akkiAutoStartDone?: boolean;
    __akkiIsMicMuted?: boolean;
  }
}
