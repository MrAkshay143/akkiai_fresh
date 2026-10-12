import React, { useEffect } from 'react';
import { Header } from '@/features/dashboard/Header';
import { LeftPanel } from '@/features/left-panel/LeftPanel';
import { CompanionHero } from '@/features/companion/CompanionHero';
import { AgentTownView } from '@/features/agent-town/AgentTownView';
import { VisualHubOverlay } from '@/features/visual-hub/VisualHubOverlay';
import { ChatDrawer } from '@/features/chat/ChatDrawer';
import { SoulModal } from '@/components/modals/SoulModal';
import { MemoryModal } from '@/components/modals/MemoryModal';
import { SkillsModal } from '@/components/modals/SkillsModal';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { OnboardingWizardModal } from '@/components/modals/OnboardingWizardModal';
import { GuideModal } from '@/components/modals/GuideModal';
import { MediaPlayerPopup } from '@/features/media/MediaPlayerPopup';
import { useAppStore } from '@/state/useAppStore';
import { LoginScreen } from '@/features/auth/LoginScreen';
import { SplashScreen } from '@/features/splash/SplashScreen';
import { audioPlayer } from '@/services/audio-player';

export const App: React.FC = () => {
  const [isBooting, setIsBooting] = React.useState(true);
  const {
    centerView,
    setTasks,
    setNotes,
    updateSettings,
    setMessages,
    setSubAgents,
    activeModal,
    setActiveModal,
    isAuthenticated,
    setIsAuthenticated,
    activeVideoId,
    setActiveVideoId,
    assistantStatus,
    setAssistantStatus,
    setCompanionSpeech,
  } = useAppStore();

  // ── Global Keyboard Shortcuts ─────────────────────────────────────────
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Escape -> Close any open modal
      if (e.key === 'Escape') {
        const state = useAppStore.getState();
        if (state.isGuideModalOpen) {
          e.preventDefault();
          audioPlayer.playSfx('button');
          state.setIsGuideModalOpen(false);
          state.setGuideFromSettings(false);
          return;
        }
        const modal = state.activeModal;
        if (modal) {
          e.preventDefault();
          audioPlayer.playSfx('button');
          state.setActiveModal(null);
          return;
        }
      }

      // Ctrl + , -> Open Settings Modal
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        audioPlayer.playSfx('button');
        useAppStore.getState().setActiveModal('settings');
        return;
      }

      // Ctrl + K -> Focus Search Bar
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const searchInput = document.getElementById('header-search-input') as HTMLInputElement | null;
        if (searchInput) {
          searchInput.focus();
          searchInput.select();
        }
        return;
      }

      // Alt + M -> Toggle Cyberpunk BGM
      if (e.altKey && (e.key === 'm' || e.key === 'M')) {
        e.preventDefault();
        audioPlayer.playSfx('button');
        audioPlayer.toggle();
        useAppStore.getState().togglePlay();
        return;
      }

      // Alt + V -> Toggle Voice Interaction
      if (e.altKey && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        const state = useAppStore.getState();
        if (state.assistantStatus === 'standby') {
          audioPlayer.playSfx('initialize');
          state.setAssistantStatus('listening');
        } else {
          audioPlayer.playSfx('button');
          state.setAssistantStatus('standby');
        }
        return;
      }

      // Ctrl + Tab / Alt + Tab -> Switch View (Agent Town / Visual Hub)
      if (((e.ctrlKey || e.metaKey) && e.key === 'Tab') || (e.altKey && e.key === 'Tab')) {
        e.preventDefault();
        audioPlayer.playSfx('button');
        const current = useAppStore.getState().centerView;
        useAppStore.getState().setCenterView(current === 'agent-town' ? 'visual-hub' : 'agent-town');
        return;
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  useEffect(() => {
    // Check Auth
    if ((window as any).electronAPI) {
      (window as any).electronAPI.invoke('auth-check-access').then((res: any) => {
        if (res && (res.access || res.approved || res.user || res.email || res.uid)) {
          setIsAuthenticated(true);
        }
      });
    }

    // Initial Theme Sync
    const savedTheme = localStorage.getItem('akki_theme') || 'akki';
    document.documentElement.setAttribute('data-theme', savedTheme);
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI.invoke('get-theme').then((t: any) => {
        if (t && typeof t === 'string') {
          useAppStore.getState().setTheme(t);
        } else {
          useAppStore.getState().setTheme(savedTheme);
        }
      }).catch(() => {
        useAppStore.getState().setTheme(savedTheme);
      });
    } else {
      useAppStore.getState().setTheme(savedTheme);
    }

    // Sync initial state from electron main store if available
    if ((window as any).electronAPI) {
      const api = (window as any).electronAPI;
      api.loadTasks?.().then((t: any) => Array.isArray(t) && t.length > 0 && setTasks(t));
      api.loadNotes?.().then((n: any) => Array.isArray(n) && n.length > 0 && setNotes(n));
      api.loadChats?.().then((c: any) => Array.isArray(c) && c.length > 0 && setMessages(c));
      api.loadSettings?.().then((s: any) => s && updateSettings(s));
      api.getAgentStates?.().then((a: any) => Array.isArray(a) && a.length > 0 && setSubAgents(a));
    }
    // Check setup walkthrough status
    if ((window as any).electronAPI?.invoke) {
      (window as any).electronAPI
        .invoke('guide-should-show')
        .then((shouldShow: boolean) => {
          if (shouldShow) {
            useAppStore.getState().setGuideFromSettings(false);
            useAppStore.getState().setIsGuideModalOpen(true);
          }
        })
        .catch((err: any) => {
          console.warn('[App] Failed to check guide-should-show:', err);
        });
    }
  }, []);


  // ── Hindu Cultural Greeting on AI connection ──
  useEffect(() => {
    if (assistantStatus === 'listening' || assistantStatus === 'speaking') {
      if (!sessionStorage.getItem('__akkiGreetingSpoken')) {
        sessionStorage.setItem('__akkiGreetingSpoken', 'true');
        const greetings = ['Radhe Radhe', 'Hare Krishna', 'Ram Ram', 'Namaste'];
        const g = greetings[Math.floor(Math.random() * greetings.length)];
        const rawName = (useAppStore.getState().settings.userName || 'Akshay').trim();
        const firstName = rawName.split(' ')[0];
        const userTag = firstName ? ' ' + firstName + ' ji' : '';
        const now = new Date();
        const h = now.getHours();
        const m = now.getMinutes();

        let period = 'subah';
        if (h >= 12 && h < 16) period = 'dopeher';
        else if (h >= 16 && h < 20) period = 'shaam';
        else if (h >= 20 || h < 4) period = 'raat';

        const h12 = h % 12 === 0 ? 12 : h % 12;
        const tStr = m === 0 ? period + ' ke ' + h12 + ' baje' : period + ' ke ' + h12 + ' bajke ' + m + ' minute';
        const greetingText = `${g}${userTag}! Abhi ${tStr} ho rahe hain. Batayein aaj main aapki kya madad kar sakti hun?`;

        setCompanionSpeech(greetingText);

        // Speak via Gemini Live Voice (neural AI model), never robotic window.speechSynthesis
        const voiceName = localStorage.getItem('GEMINI_VOICE_NAME') || useAppStore.getState().settings.selectedVoice || 'Despina';
        if ((window as any).electronAPI?.invoke) {
          (window as any).electronAPI
            .invoke('gemini-speak', {
              text: greetingText,
              voice: voiceName,
            })
            .then((res: any) => {
              if (res && res.success && res.audioData) {
                const aud = new Audio(`data:${res.mimeType || 'audio/wav'};base64,${res.audioData}`);
                aud.play().catch((err) => console.warn('[App] Neural voice play error:', err));
              }
            })
            .catch((err: any) => console.warn('[App] gemini-speak invoke failed:', err));
        }
      }
    }
  }, [assistantStatus]);

  if (isBooting) {
    return <SplashScreen onFinished={() => setIsBooting(false)} />;
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return (
    <div className="flex flex-col w-screen h-screen bg-transparent text-j-text-primary font-sans overflow-hidden selection:bg-j-cyan/20 relative">
      {/* ── Cybernetic Hex Grid Ambient Layer ───────────────────────── */}
      <div className="absolute inset-0 bg-hex-grid opacity-[0.05] pointer-events-none z-0" />

      {/* ── Top Header Strip ─────────────────────────────────────────── */}
      <Header />

      {/* ── Main Dashboard Workspace (Exact Legacy #AKKI-main-layout) ── */}
      <div id="AKKI-main-layout" className="flex-1 flex flex-col relative z-10 bg-transparent p-4 min-h-0">
        <main className="flex-1 flex overflow-hidden z-10 relative bg-transparent gap-2 md:gap-4 h-full w-full">
          {/* ── Left Column: Tasks / Notes + Windy Radar (Exact Legacy nK) ── */}
          <section className="hidden xl:flex w-[365px] 2xl:w-[420px] shrink-0 h-full flex-col">
            <LeftPanel />
          </section>

          {/* ── Center Column: Companion Hub + Agent Town / Visual Hub (Exact Legacy uK flex ratio) ────── */}
          <section className="flex-1 flex flex-col min-w-0 min-h-0 relative h-full gap-2 md:gap-4 transition-all duration-300 overflow-hidden">
            <div className="flex-[0.9] flex items-center justify-center w-full min-h-0 relative z-20">
              <CompanionHero />
            </div>
            <div className="flex-[1.3] w-full relative z-10 min-h-0 mt-0 agent-town-parent">
              <div style={{ display: centerView === 'agent-town' ? 'block' : 'none', height: '100%', width: '100%' }}>
                <AgentTownView />
              </div>
              <div style={{ display: centerView === 'visual-hub' ? 'block' : 'none', height: '100%', width: '100%' }}>
                <VisualHubOverlay />
              </div>
            </div>
          </section>

          {/* ── Right Column: Chats / Logs Drawer (Exact Legacy AK) ─────────────── */}
          <aside className="hidden md:flex w-[380px] 2xl:w-[410px] h-full shrink-0 flex-col relative">
            <ChatDrawer />
          </aside>
        </main>
      </div>

      {/* ── Modals & Floating Overlays ─────────────────────────────────── */}
      <SoulModal />
      <MemoryModal />
      <SkillsModal />
      <SettingsModal />
      <OnboardingWizardModal isOpen={activeModal === 'wizard'} onClose={() => setActiveModal(null)} />
      <GuideModal />

      {/* ── Dedicated Neural Media Player Popup (VH) ─────────────────── */}
      {activeVideoId && (
        <MediaPlayerPopup videoId={activeVideoId} onClose={() => setActiveVideoId(null)} />
      )}
    </div>
  );
};

export default App;
