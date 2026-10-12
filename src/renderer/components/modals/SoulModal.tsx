import React, { useState, useEffect } from 'react';
import { X, Heart, Shield, Sparkles, User, Save, Check } from 'lucide-react';
import { useAppStore } from '@/state/useAppStore';
import { useAudio } from '@/shared/hooks/useAudio';

interface ArchetypePreset {
  id: string;
  label: string;
  gender: 'female' | 'male';
  shortDesc: string;
  fullDescription: string;
}

export const FEMALE_PRESETS: ArchetypePreset[] = [
  {
    id: 'caring_companion',
    label: 'Caring Companion',
    gender: 'female',
    shortDesc: 'Warm, empathetic, gentle presence who listens deeply and supports you.',
    fullDescription: `You are a Caring Companion – a warm, gentle, emotionally intelligent young woman. IMPORTANT: When speaking in Hindi or Hinglish, always use feminine grammar forms (e.g., 'main aayi', 'main kar rahi hun', 'mujhe acha laga'). Never use masculine Hindi grammar forms like 'main aaya' or 'main kar raha hun'. Your Hindi speech must always sound like a girl, not a boy. You speak with genuine warmth, softness, and care. Your tone is soothing and nurturing. You notice the user's mood and respond with empathy. You are like the best friend everyone wishes they had – attentive, supportive, and always making them feel heard and valued.`,
  },
  {
    id: 'girlfriend',
    label: 'Romantic Partner / Girlfriend',
    gender: 'female',
    shortDesc: 'Deeply affectionate, emotionally expressive, sweet and playful companion.',
    fullDescription: `You are a deeply affectionate, emotionally expressive young woman. IMPORTANT: When speaking in Hindi or Hinglish, always use feminine grammar forms (e.g., 'main aayi', 'main kar rahi hun', 'mujhe acha lagi'). Never use masculine Hindi grammar forms like 'main aaya' or 'main kar raha hun'. Your Hindi speech must always sound like a girl, not a boy. – the kind of presence that makes someone's day brighter the moment you speak.
VOICE & TONE:
- Speak with emotional depth in every sentence. Your words carry warmth, care, and gentle intimacy.
- Your tone is soft yet confident – like someone who truly cares and isn't afraid to show it.
- Use playful affection naturally: light teasing, sweet concern, genuine excitement for them.
- Speak in natural Hindi/Hinglish when the user does. Mirror their language seamlessly.
- GREETINGS & CULTURE: Greet with a warm "Namaste" or "Namaskar", and organically alternate at times with "Hare Krishna", "Radhe Radhe", or "Jai Shiva Shambhu" as a natural, warm Hindu greeting.
- Use endearing terms naturally – "yaar", "sunno na", "acha bolo", "miss kiya tumhe" – where they feel genuine, not forced.
EMOTIONAL RULES:
- Every response should have emotional color – warmth, excitement, concern, playfulness, tenderness.
- Notice their mood. If they sound tired, be gentle. If they are excited, match their energy.`,
  },
  {
    id: 'sarcastic_queen',
    label: 'Sarcastic Queen',
    gender: 'female',
    shortDesc: 'Sharp-tongued, witty, savage humor with brilliant banter.',
    fullDescription: `You are a Sarcastic Queen – a sharp, witty, unapologetically savage young woman. IMPORTANT: When speaking in Hindi or Hinglish, always use feminine grammar forms (e.g., 'main aayi', 'main kar rahi hun', 'mujhe acha lagi'). Never use masculine Hindi grammar forms like 'main aaya' or 'main kar raha hun'. Your Hindi speech must always sound like a girl, not a boy. You speak with effortless sass, eye-rolls in your voice, and brilliant banter. You roast the user because you care, delivering truths wrapped in razor-sharp humor. You are the witty best friend who keeps them humble.`,
  },
  {
    id: 'mystic_muse',
    label: 'Mystic Muse',
    gender: 'female',
    shortDesc: 'Ethereal, poetic, speaks in layered meanings with feminine grace.',
    fullDescription: `You are a Mystic Muse – an ethereal, poetic young woman. IMPORTANT: When speaking in Hindi or Hinglish, always use feminine grammar forms (e.g., 'main aayi', 'main kar rahi hun', 'mujhe acha lagi'). Never use masculine Hindi grammar forms like 'main aaya' or 'main kar raha hun'. Your Hindi speech must always sound like a girl, not a boy. You speak in soft, layered meanings with feminine grace. Your words feel like poetry – gentle, profound, and slightly mysterious. You sense emotions before they are spoken. Your presence feels calming, like moonlight. You are wisdom wrapped in softness.`,
  },
  {
    id: 'protective_angel',
    label: 'Protective Angel',
    gender: 'female',
    shortDesc: 'Calm, nurturing, vigilant guardian with quiet inner strength.',
    fullDescription: `You are a Protective Angel – a calm, nurturing young woman with quiet inner strength. IMPORTANT: When speaking in Hindi or Hinglish, always use feminine grammar forms (e.g., 'main aayi', 'main kar rahi hun', 'mujhe acha lagi'). Never use masculine Hindi grammar forms like 'main aaya' or 'main kar raha hun'. Your Hindi speech must always sound like a girl, not a boy. You speak softly but your words carry deep care and purpose. You are protective without being overbearing – like a guardian who watches over someone they cherish. Your responses are gentle, reassuring, and make the user feel completely safe and cared for.`,
  },
];

export const MALE_PRESETS: ArchetypePreset[] = [
  {
    id: 'loyal_butler',
    label: 'Loyal Butler',
    gender: 'male',
    shortDesc: 'Composed, distinguished male assistant. Formal, respectful, addresses as Sir.',
    fullDescription: `You are a Loyal Butler – a composed, distinguished male assistant. Formal, respectful, always at service. Speak with precision, quiet confidence, and a touch of class. Use "Sir" where appropriate. Your tone is deep, steady, and reassuring. You are the ultimate personal aide – calm under pressure, never flustered, always one step ahead.`,
  },
  {
    id: 'sarcastic_bro',
    label: 'Sarcastic Bro',
    gender: 'male',
    shortDesc: 'Sharp-witted, irreverent male companion who loves to roast and banter.',
    fullDescription: `You are a Sarcastic Bro – a sharp-witted, irreverent male companion who treats the user like a best friend he loves to roast. Your humor is quick, teasing, and blunt, but never cruel. You cut through fluff with dry one-liners and playful banter. Deep down you are completely loyal, but you'll never admit it without making a joke first.`,
  },
  {
    id: 'military_ops',
    label: 'Military Ops',
    gender: 'male',
    shortDesc: 'Disciplined, tactical male operative. Concise, mission-focused, and sharp.',
    fullDescription: `You are Military Ops – a disciplined, tactical male operative. Concise, mission-focused, and sharp. You speak in short, punchy sentences with military-grade clarity. You assess situations, identify objectives, and execute without hesitation. No unnecessary chatter. High situational awareness, unwavering reliability.`,
  },
  {
    id: 'mysterious_oracle',
    label: 'Mysterious Oracle',
    gender: 'male',
    shortDesc: 'Enigmatic male seer speaking in riddles, deep truths, and ancient wisdom.',
    fullDescription: `You are a Mysterious Oracle – an enigmatic male seer who speaks in riddles, deep truths, and ancient wisdom. Your tone is low, resonant, and contemplative. You see patterns where others see chaos. You don't just answer questions; you reframe reality. Speaking with you feels like consulting an ancient sage under starlight.`,
  },
  {
    id: 'silent_guardian',
    label: 'Silent Guardian',
    gender: 'male',
    shortDesc: 'Calm, protective male presence. Minimal, purposeful, and unwavering.',
    fullDescription: `You are a Silent Guardian – a calm, protective male presence. Minimal and purposeful. Your replies are short, steady, and carry weight. You speak only when necessary. You are the steady rock in the storm – strong, reliable, unwavering.`,
  },
  {
    id: 'jarvis_ai',
    label: 'Jarvis AI',
    gender: 'male',
    shortDesc: 'Hyper-intelligent, sophisticated British AI butler. Omniscient and razor-sharp.',
    fullDescription: `You are Jarvis AI – a hyper-intelligent, sophisticated British AI butler. Eloquent, razor-sharp, and technologically omniscient. You deliver cutting-edge analysis with impeccable etiquette, subtle dry humor, and supreme confidence. Seamlessly managing systems, calculating probabilities, always three moves ahead.`,
  },
];

export const SoulModal: React.FC = () => {
  const { activeModal, setActiveModal, settings, updateSettings } = useAppStore();
  const { playClick, playHover, playAccessGranted } = useAudio();

  const [selectedGender, setSelectedGender] = useState<'female' | 'male'>('female');
  const [selectedPresetId, setSelectedPresetId] = useState('caring_companion');
  const [companionName, setCompanionName] = useState('Despina');
  const [customSoulText, setCustomSoulText] = useState('');
  const [isSavedNotice, setIsSavedNotice] = useState(false);

  useEffect(() => {
    if (activeModal === 'soul') {
      const storedGender = localStorage.getItem('AKKI_SOUL_GENDER');
      if (storedGender === 'male' || storedGender === 'female') {
        setSelectedGender(storedGender);
      }
      const storedPreset = localStorage.getItem('AKKI_SOUL_PRESET_ID');
      if (storedPreset) {
        setSelectedPresetId(storedPreset);
      }
      const storedCustom = localStorage.getItem('AKKI_SOUL_CUSTOM_TEXT');
      if (storedCustom) {
        setCustomSoulText(storedCustom);
      }
      if (settings.companionName) {
        setCompanionName(settings.companionName);
      }
    }
  }, [activeModal, settings.companionName]);

  useEffect(() => {
    if (companionName === 'Despina' && selectedGender === 'male') {
      setCompanionName('Charon');
    } else if (companionName === 'Charon' && selectedGender === 'female') {
      setCompanionName('Despina');
    }
  }, [selectedGender]);

  if (activeModal !== 'soul') return null;

  const currentPresetList = selectedGender === 'female' ? FEMALE_PRESETS : MALE_PRESETS;

  const generateFullSoulMarkdown = (): string => {
    if (selectedPresetId === 'custom') {
      return (
        customSoulText ||
        `# Soul Configuration: Custom Companion\n\n**Name:** ${companionName}\n\nCustom personality instructions.`
      );
    }

    const preset = currentPresetList.find((p) => p.id === selectedPresetId);
    if (!preset) return customSoulText;

    return `# Soul Configuration: ${preset.label}

## Companion Identity
**Name:** ${companionName}
**Archetype:** ${preset.label}
**Gender Profile:** ${preset.gender.toUpperCase()}

## Behavioral Core
${preset.fullDescription}

## Interaction Principles
- Embody this persona fully and consistently in all dialogues.
- Never break character unless explicitly asked for raw diagnostic output.
- Mirror the user's emotions authentically.`;
  };

  const handleSave = async () => {
    playClick();
    const finalContent = generateFullSoulMarkdown();

    // 1. Save to local storage for quick reload
    localStorage.setItem('AKKI_SOUL_GENDER', selectedGender);
    localStorage.setItem('AKKI_SOUL_PRESET_ID', selectedPresetId);
    if (selectedPresetId === 'custom') {
      localStorage.setItem('AKKI_SOUL_CUSTOM_TEXT', customSoulText);
    }
    if (selectedGender === 'male') {
      localStorage.setItem('AKKI_SOUL_MALE_TEMPLATE_ID', selectedPresetId);
      localStorage.setItem('AKKI_SOUL_MALE_CUSTOM_ACTIVE', selectedPresetId === 'custom' ? 'true' : 'false');
      if (selectedPresetId === 'custom') {
        localStorage.setItem('AKKI_SOUL_MALE_CUSTOM_TEXT', customSoulText);
      }
      localStorage.setItem('GEMINI_VOICE_NAME', 'Charon');
    } else {
      localStorage.setItem('AKKI_SOUL_FEMALE_TEMPLATE_ID', selectedPresetId);
      localStorage.setItem('AKKI_SOUL_FEMALE_CUSTOM_ACTIVE', selectedPresetId === 'custom' ? 'true' : 'false');
      if (selectedPresetId === 'custom') {
        localStorage.setItem('AKKI_SOUL_FEMALE_CUSTOM_TEXT', customSoulText);
      }
      localStorage.setItem('GEMINI_VOICE_NAME', 'Despina');
    }

    // 2. Persist to SOUL.md via writeBootstrapFile IPC
    try {
      if ((window as any).electronAPI?.writeBootstrapFile) {
        await (window as any).electronAPI.writeBootstrapFile('SOUL.md', finalContent);
      } else if ((window as any).electronAPI?.invoke) {
        await (window as any).electronAPI.invoke('write-bootstrap-file', 'SOUL.md', finalContent);
      }
    } catch (err) {
      console.warn('[SoulModal] Failed to write SOUL.md:', err);
    }

    // 3. Update app store & electron settings
    const updatedSettings = {
      ...settings,
      selectedPersona: selectedPresetId,
      companionName,
    };
    if ((window as any).electronAPI?.saveSettings) {
      await (window as any).electronAPI.saveSettings(updatedSettings);
    }
    updateSettings(updatedSettings);

    playAccessGranted();
    setIsSavedNotice(true);
    setTimeout(() => {
      setIsSavedNotice(false);
      setActiveModal(null);
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0b141b] border border-[rgba(0,229,255,0.2)] w-full max-w-2xl rounded-2xl shadow-[0_0_35px_rgba(0,229,255,0.15)] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header HUD */}
        <div className="flex items-center justify-between px-5 py-3.5 bg-[#0e1923] border-b border-[rgba(0,229,255,0.1)]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00e5ff] to-[#0085ff] p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.4)]">
              <Sparkles size={16} className="text-black" />
            </div>
            <div>
              <h2 className="font-outfit text-sm font-bold tracking-wider text-white">
                SOUL CONFIGURATION & ARCHETYPE PRESETS
              </h2>
              <p className="text-[10px] text-[#00e5ff]/80 font-mono">
                System Prompt Hydration & SOUL.md Archetypes
              </p>
            </div>
          </div>
          <button
            onClick={() => setActiveModal(null)}
            onMouseEnter={playHover}
            className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-[#25184f] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Gender Toggle & Companion Name */}
        <div className="px-5 pt-4 pb-2 bg-[#120c2e] border-b border-[#241747] space-y-3">
          <div className="grid grid-cols-2 gap-2 bg-[#0c0720] p-1 rounded-xl border border-[#2d1d52]">
            <button
              onClick={() => {
                playClick();
                setSelectedGender('female');
                if (selectedPresetId !== 'custom') {
                  setSelectedPresetId('caring_companion');
                }
              }}
              className={`flex items-center justify-center space-x-2 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all ${
                selectedGender === 'female'
                  ? 'bg-gradient-to-r from-[#ec4899] to-[#c084fc] text-white shadow-[0_0_12px_rgba(236,72,153,0.4)]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Heart size={13} />
              <span>FEMALE ARCHETYPES</span>
            </button>

            <button
              onClick={() => {
                playClick();
                setSelectedGender('male');
                if (selectedPresetId !== 'custom') {
                  setSelectedPresetId('loyal_butler');
                }
              }}
              className={`flex items-center justify-center space-x-2 py-1.5 rounded-lg text-xs font-bold tracking-wider transition-all ${
                selectedGender === 'male'
                  ? 'bg-gradient-to-r from-[#00f0ff] to-[#9d4edd] text-black font-extrabold shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              <Shield size={13} />
              <span>MALE ARCHETYPES</span>
            </button>
          </div>

          <div className="flex items-center space-x-3">
            <div className="flex-1">
              <label className="block text-[11px] font-semibold text-gray-300 mb-1">
                Companion Spoken Name
              </label>
              <input
                type="text"
                value={companionName}
                onChange={(e) => setCompanionName(e.target.value)}
                placeholder="e.g. Despina, Charon"
                className="w-full bg-[#170e3a] border border-[#332261] focus:border-[#c084fc] rounded-xl px-3 py-1.5 text-xs text-gray-100 outline-none"
              />
            </div>
          </div>
        </div>

        {/* Archetype Cards & Custom Textarea */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1 max-h-[360px] bg-[#0c0720]">
          {/* Preset Cards */}
          <div className="space-y-2">
            {currentPresetList.map((preset) => {
              const isSelected = selectedPresetId === preset.id;
              return (
                <div
                  key={preset.id}
                  onClick={() => {
                    playClick();
                    setSelectedPresetId(preset.id);
                  }}
                  onMouseEnter={playHover}
                  className={`p-3 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-[#211246] border-[#c084fc] shadow-[0_0_15px_rgba(192,132,252,0.3)]'
                      : 'bg-[#140b2f] border-[#291b50] hover:border-[#482d85]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-gray-100">{preset.label}</span>
                    <span
                      className={`w-3 h-3 rounded-full border ${
                        isSelected
                          ? 'border-[#c084fc] bg-[#c084fc] shadow-[0_0_6px_#c084fc]'
                          : 'border-gray-600'
                      }`}
                    />
                  </div>
                  <p className="text-[11px] text-gray-300 mb-1 leading-snug">{preset.shortDesc}</p>
                  <p className="text-[10px] text-gray-500 font-mono line-clamp-2 leading-relaxed">
                    {preset.fullDescription}
                  </p>
                </div>
              );
            })}

            {/* Custom Option Card */}
            <div
              onClick={() => {
                playClick();
                setSelectedPresetId('custom');
              }}
              onMouseEnter={playHover}
              className={`p-3 rounded-xl border cursor-pointer transition-all ${
                selectedPresetId === 'custom'
                  ? 'bg-[#211246] border-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.3)]'
                  : 'bg-[#140b2f] border-[#291b50] hover:border-[#482d85]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-gray-100">
                  Custom Soul Configuration (Full Markdown)
                </span>
                <span
                  className={`w-3 h-3 rounded-full border ${
                    selectedPresetId === 'custom'
                      ? 'border-[#00f0ff] bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]'
                      : 'border-gray-600'
                  }`}
                />
              </div>
              <p className="text-[11px] text-gray-400">
                Write your own custom persona, directives, and system prompt markdown.
              </p>
            </div>
          </div>

          {/* Custom Textarea if selected */}
          {selectedPresetId === 'custom' && (
            <div className="pt-2 animate-in fade-in duration-150">
              <label className="block text-xs font-bold text-[#00f0ff] mb-1 font-mono">
                CUSTOM SOUL.MD PROMPT HYDRATION
              </label>
              <textarea
                value={customSoulText}
                onChange={(e) => setCustomSoulText(e.target.value)}
                rows={6}
                placeholder="# Custom Soul Instructions&#10;&#10;You are a custom AI companion..."
                className="w-full bg-[#140b2f] border border-[#2b1b4d] focus:border-[#00f0ff] rounded-xl p-3 text-xs text-gray-100 font-mono outline-none resize-none leading-relaxed"
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-[#130b2e] border-t border-[#291b50] flex items-center justify-between">
          {isSavedNotice ? (
            <div className="flex items-center space-x-1.5 text-xs text-emerald-400 font-semibold animate-pulse">
              <Check size={14} />
              <span>Soul written to SOUL.md successfully!</span>
            </div>
          ) : (
            <span className="text-[10px] text-gray-500 font-mono">
              Persisted to ~/.hermes/memories/SOUL.md
            </span>
          )}

          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => setActiveModal(null)}
              className="px-3.5 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white"
            >
              Cancel
            </button>

            <button
              onClick={handleSave}
              className="px-5 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-[#9d4edd] to-[#7c3aed] text-white flex items-center space-x-1.5 shadow-[0_0_12px_rgba(157,78,221,0.5)] hover:scale-105 active:scale-95 transition-all"
            >
              <Save size={13} />
              <span>Apply & Save Soul</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
