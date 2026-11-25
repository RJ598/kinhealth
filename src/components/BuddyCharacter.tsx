import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { RotateCcw, Sparkles } from 'lucide-react';
import type { BodyLog, MemberProfile } from '../types';
import { computeBodyIndexesFromBmi } from '../types';

interface BuddyCharacterProps {
  profile: MemberProfile;
  latestBody: BodyLog | null;
  previousBody: BodyLog | null;
  caloriesToday: number;
  proteinToday: number;
  justUpdatedTick?: number;
  compact?: boolean;
}

type CuteAction = 'idle' | 'wave' | 'flex' | 'hop' | 'look' | 'dance';

const ACTION_SEQUENCE: CuteAction[] = [
  'wave',
  'look',
  'dance',
  'hop',
  'flex',
  'idle',
];

const ACTION_CAPTIONS: Record<CuteAction, string> = {
  idle: 'Bouncing happily',
  wave: 'Hi there!',
  flex: 'Feeling strong!',
  hop: 'Boing! Boing!',
  look: 'Checking the snacks…',
  dance: 'Happy wiggle!',
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export const BuddyCharacter: React.FC<BuddyCharacterProps> = ({
  profile,
  latestBody,
  previousBody,
  caloriesToday,
  proteinToday,
  justUpdatedTick = 0,
  compact = false,
}) => {
  const [showingPrev, setShowingPrev] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [cuteAction, setCuteAction] = useState<CuteAction>('wave');
  const [tapCaption, setTapCaption] = useState<string | null>(null);
  const [burstKey, setBurstKey] = useState(0);
  const [manualUntil, setManualUntil] = useState(0);

  // Trigger visible transformation animation when a new body check-in is saved
  useEffect(() => {
    if (justUpdatedTick <= 0) return;
    setBurstKey((k) => k + 1);
    if (previousBody) {
      setShowingPrev(true);
      const t1 = window.setTimeout(() => {
        setShowingPrev(false);
        setCelebrating(true);
        setCuteAction('hop');
      }, 450);
      const t2 = window.setTimeout(() => {
        setCelebrating(false);
      }, 3000);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    } else {
      setCelebrating(true);
      setCuteAction('hop');
      const t = window.setTimeout(() => setCelebrating(false), 2600);
      return () => window.clearTimeout(t);
    }
  }, [justUpdatedTick, previousBody]);

  // Continuous autonomous cute behavior loop
  useEffect(() => {
    const id = window.setInterval(() => {
      if (Date.now() < manualUntil || celebrating || showingPrev) return;
      setCuteAction((prev) => {
        const idx = ACTION_SEQUENCE.indexOf(prev);
        return ACTION_SEQUENCE[(idx + 1) % ACTION_SEQUENCE.length];
      });
    }, 3200);
    return () => window.clearInterval(id);
  }, [manualUntil, celebrating, showingPrev]);

  // Clear temporary tap speech caption cleanly
  useEffect(() => {
    if (!tapCaption) return;
    const t = window.setTimeout(() => setTapCaption(null), 2200);
    return () => window.clearTimeout(t);
  }, [tapCaption]);

  const triggerTrick = (action: CuteAction, customCaption?: string) => {
    setCuteAction(action);
    setManualUntil(Date.now() + 3400);
    setBurstKey((k) => k + 1);
    setTapCaption(customCaption ?? ACTION_CAPTIONS[action]);
  };

  const handleStageTap = () => {
    const idx = ACTION_SEQUENCE.indexOf(cuteAction);
    const next = ACTION_SEQUENCE[(idx + 1) % (ACTION_SEQUENCE.length - 1)];
    triggerTrick(next);
  };

  const replayTransformation = () => {
    if (!previousBody || !latestBody) return;
    setShowingPrev(true);
    window.setTimeout(() => {
      setShowingPrev(false);
      setCelebrating(true);
      setCuteAction('hop');
      setBurstKey((k) => k + 1);
      window.setTimeout(() => setCelebrating(false), 2400);
    }, 550);
  };

  const activeBody = showingPrev && previousBody ? previousBody : latestBody;

  const activeIndexes = useMemo(() => {
    if (!activeBody) return null;
    return computeBodyIndexesFromBmi(
      activeBody.bmi,
      activeBody.muscleMassKg,
      activeBody.bodyFatPct,
      profile.heightCm
    );
  }, [activeBody, profile.heightCm]);

  const deltas = useMemo(() => {
    if (!latestBody || !previousBody) return null;
    return {
      bmi: Number((latestBody.bmi - previousBody.bmi).toFixed(1)),
      fat: Number((latestBody.bodyFatPct - previousBody.bodyFatPct).toFixed(1)),
      muscle: Number((latestBody.muscleMassKg - previousBody.muscleMassKg).toFixed(1)),
    };
  }, [latestBody, previousBody]);

  // Morph parameters derived from BMI, Body Fat %, and Muscle Mass
  const bmi = activeIndexes?.bmi ?? 22.0;
  const smi = activeIndexes?.smi ?? 8.0;
  const ffmi = activeIndexes?.ffmi ?? 18.5;
  const bodyFat = activeBody?.bodyFatPct ?? 20;

  const torsoRx = clamp(28 + (bmi - 22) * 1.45 + (bodyFat - 20) * 0.25, 22, 42);
  const shoulderHalf = clamp(24 + (smi - 8) * 1.8 + (ffmi - 18) * 0.9, 20, 36);
  const armWidth = clamp(9.5 + (smi - 7.5) * 1.1 + (ffmi - 18) * 0.45, 8, 16);
  const hasAthleticBand = smi >= 8.2 || ffmi >= 19.2 || (deltas !== null && deltas.muscle > 0);
  const showDumbbell =
    celebrating ||
    cuteAction === 'flex' ||
    (deltas !== null && deltas.muscle > 0);

  const proteinPct = Math.round(
    (proteinToday / Math.max(1, profile.proteinTargetG)) * 100
  );
  const calPct = Math.round(
    (caloriesToday / Math.max(1, profile.calorieTarget)) * 100
  );

  let moodStatus = 'Ready for today';
  let moodVariant: 'sleepy' | 'happy' | 'energized' | 'stuffed' = 'happy';
  if (caloriesToday === 0 && proteinToday === 0) {
    moodStatus = 'Waiting for your first meal';
    moodVariant = 'sleepy';
  } else if (proteinPct >= 85) {
    moodStatus = 'Protein target hit · Energized';
    moodVariant = 'energized';
  } else if (calPct > 115) {
    moodStatus = 'Well fed · Surplus today';
    moodVariant = 'stuffed';
  } else {
    moodStatus = 'On track today';
    moodVariant = 'happy';
  }

  const primaryColor =
    moodVariant === 'energized'
      ? '#059669'
      : moodVariant === 'stuffed'
      ? '#d97706'
      : '#0f766e';
  const bodyFill =
    moodVariant === 'energized'
      ? '#d1fae5'
      : moodVariant === 'stuffed'
      ? '#fef3c7'
      : '#e2f5f0';

  const spring = { type: 'spring' as const, stiffness: 130, damping: 14 };
  const activeMode: CuteAction = celebrating ? 'hop' : cuteAction;
  const happyEyes =
    activeMode === 'wave' || activeMode === 'hop' || activeMode === 'dance' || tapCaption !== null;
  const showSparkles =
    celebrating ||
    moodVariant === 'energized' ||
    activeMode === 'hop' ||
    activeMode === 'flex' ||
    activeMode === 'dance';

  const statusLine = showingPrev
    ? 'Previous check-in state…'
    : celebrating
    ? 'Updated from latest BMI, fat % & muscle!'
    : tapCaption
    ? tapCaption
    : `${moodStatus} · ${ACTION_CAPTIONS[activeMode]}`;

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-slate-900">
            {profile.displayName}&apos;s KinBuddy
          </h3>
          <p className="text-xs text-slate-500 truncate">{statusLine}</p>
        </div>

        {previousBody && latestBody && (
          <button
            type="button"
            onClick={replayTransformation}
            title="Replay transformation from previous check-in"
            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Replay Change
          </button>
        )}
      </div>

      {/* Interactive Cute Character Stage */}
      <div
        onClick={handleStageTap}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStageTap();
          }
        }}
        title="Tap KinBuddy for a cute trick!"
        className="relative my-3 flex flex-col items-center justify-center bg-slate-50/70 border border-slate-100 rounded-xl py-3.5 overflow-hidden cursor-pointer select-none focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
      >
        <AnimatePresence mode="wait">
          {celebrating ? (
            <motion.div
              key="celebrate-msg"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold text-emerald-700"
            >
              <Sparkles className="w-3 h-3" />
              Body Indexes Updated
            </motion.div>
          ) : tapCaption ? (
            <motion.div
              key={`cap-${burstKey}`}
              initial={{ opacity: 0, y: 6, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4 }}
              className="mb-0.5 text-[11px] font-semibold text-emerald-700"
            >
              {tapCaption}
            </motion.div>
          ) : null}
        </AnimatePresence>

        <svg
          viewBox="0 0 220 194"
          className={compact ? 'w-44 h-38' : 'w-52 h-44'}
          aria-label="Animated character reflecting BMI, body fat, and muscle mass"
        >
          {/* Floating Sleepy Zzz when no meals logged yet and not doing active tap */}
          {moodVariant === 'sleepy' && activeMode === 'idle' && !tapCaption && (
            <g>
              <motion.text
                x="146"
                y="46"
                fontSize="11"
                fontWeight="700"
                fill="#64748b"
                animate={{ y: [46, 30], x: [146, 154], opacity: [0, 0.85, 0] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeOut' }}
              >
                z
              </motion.text>
              <motion.text
                x="156"
                y="36"
                fontSize="13"
                fontWeight="700"
                fill="#475569"
                animate={{ y: [36, 18], x: [156, 166], opacity: [0, 0.9, 0] }}
                transition={{ duration: 2.2, delay: 0.9, repeat: Infinity, ease: 'easeOut' }}
              >
                Z
              </motion.text>
            </g>
          )}

          {/* Cute Floating Hearts & Sparkles */}
          {showSparkles && (
            <g>
              <motion.path
                d="M 48 54 L 50 48 L 52 54 L 58 56 L 52 58 L 50 64 L 48 58 L 42 56 Z"
                fill="#10b981"
                animate={{
                  y: [0, -14, -22],
                  opacity: [0, 0.95, 0],
                  scale: [0.6, 1.05, 0.7],
                }}
                transition={{ duration: 1.9, repeat: Infinity, ease: 'easeOut' }}
                style={{ transformOrigin: '50px 56px' }}
              />
              <motion.path
                d="M 172 46 L 174 41 L 176 46 L 181 48 L 176 50 L 174 55 L 172 50 L 167 48 Z"
                fill="#f59e0b"
                animate={{
                  y: [0, -12, -20],
                  opacity: [0, 0.95, 0],
                  scale: [0.7, 1.1, 0.6],
                }}
                transition={{ duration: 1.7, delay: 0.6, repeat: Infinity, ease: 'easeOut' }}
                style={{ transformOrigin: '174px 48px' }}
              />
              <motion.path
                d="M 164 82 C 164 78 169 78 170 81 C 171 78 176 78 176 82 C 176 86 170 90 170 90 C 170 90 164 86 164 82 Z"
                fill="#fb7185"
                animate={{
                  y: [4, -14, -24],
                  opacity: [0, 0.9, 0],
                  scale: [0.65, 1, 0.7],
                }}
                transition={{ duration: 2.1, delay: 0.3, repeat: Infinity, ease: 'easeOut' }}
                style={{ transformOrigin: '170px 84px' }}
              />
            </g>
          )}

          {/* Soft floor shadow (squishes inversely during hops & bounces) */}
          <motion.ellipse
            cx="110"
            cy="174"
            ry="6"
            fill="#cbd5e1"
            animate={{
              rx:
                activeMode === 'hop'
                  ? [torsoRx * 1.15, torsoRx * 0.85, torsoRx * 1.15]
                  : activeMode === 'dance'
                  ? [torsoRx * 1.1, torsoRx * 1.2, torsoRx * 1.1]
                  : [torsoRx * 1.12, torsoRx * 1.18, torsoRx * 1.12],
              opacity: activeMode === 'hop' ? [0.55, 0.32, 0.55] : 0.55,
            }}
            transition={{
              duration: activeMode === 'hop' ? 0.65 : 1.6,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          {/* Cute Aura Ring when protein goal hit or celebrating */}
          {(moodVariant === 'energized' || celebrating) && (
            <motion.circle
              cx="110"
              cy="104"
              r="72"
              fill="none"
              stroke="#10b981"
              strokeWidth="1.5"
              strokeDasharray="6 6"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 0.45, rotate: 360, scale: 1 }}
              transition={{ rotate: { duration: 16, repeat: Infinity, ease: 'linear' } }}
              style={{ transformOrigin: '110px 104px' }}
            />
          )}

          {/* Main Character Rig with Organic Bounce / Squish / Dance */}
          <motion.g
            animate={
              activeMode === 'hop'
                ? {
                    y: [0, -18, 0, -11, 0],
                    scaleX: [1.05, 0.94, 1.07, 0.96, 1],
                    scaleY: [0.95, 1.06, 0.93, 1.04, 1],
                    rotate: [0, -2, 0, 2, 0],
                  }
                : activeMode === 'dance'
                ? {
                    y: [0, -5, 0, -5, 0],
                    rotate: [-5, 5, -5, 5, -5],
                    scaleY: [0.98, 1.02, 0.98, 1.02, 0.98],
                  }
                : activeMode === 'flex'
                ? {
                    y: [0, -3, 0],
                    scaleX: [1, 1.04, 1],
                    scaleY: [1, 0.97, 1],
                  }
                : activeMode === 'wave'
                ? {
                    y: [0, -4, 0],
                    rotate: [-2, 3, -2],
                  }
                : {
                    y: [0, -3.5, 0],
                    scaleX: [1, 1.025, 1],
                    scaleY: [1, 0.98, 1],
                  }
            }
            transition={{
              duration:
                activeMode === 'hop'
                  ? 1.15
                  : activeMode === 'dance'
                  ? 1.3
                  : 2.2,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            style={{ transformOrigin: '110px 168px' }}
          >
            {/* Left Leg & Tapping Shoe */}
            <motion.g
              animate={
                activeMode === 'dance'
                  ? { y: [0, -4, 0, 0, 0], rotate: [0, -8, 0, 0, 0] }
                  : activeMode === 'hop'
                  ? { y: [0, -3, 0] }
                  : { y: 0, rotate: 0 }
              }
              transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '98px 142px' }}
            >
              <rect x="92" y="140" width="12" height="26" rx="6" fill={primaryColor} />
              <ellipse cx="96" cy="166" rx="9" ry="5" fill="#0f172a" />
            </motion.g>

            {/* Right Leg & Tapping Shoe */}
            <motion.g
              animate={
                activeMode === 'dance'
                  ? { y: [0, 0, 0, -4, 0], rotate: [0, 0, 0, 8, 0] }
                  : activeMode === 'hop'
                  ? { y: [0, -3, 0] }
                  : { y: 0, rotate: 0 }
              }
              transition={{ duration: 1.3, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '122px 142px' }}
            >
              <rect x="116" y="140" width="12" height="26" rx="6" fill={primaryColor} />
              <ellipse cx="124" cy="166" rx="9" ry="5" fill="#0f172a" />
            </motion.g>

            {/* Left Arm */}
            <motion.g
              animate={
                activeMode === 'wave'
                  ? { rotate: [115, 148, 112, 148, 115] }
                  : activeMode === 'hop'
                  ? { rotate: [120, 142, 120] }
                  : activeMode === 'flex'
                  ? { rotate: [85, 102, 85] }
                  : activeMode === 'dance'
                  ? { rotate: [18, 52, 18, -10, 18] }
                  : { rotate: moodVariant === 'energized' ? [12, 24, 12] : [4, 12, 4] }
              }
              transition={{
                duration: activeMode === 'wave' ? 1.1 : 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ transformOrigin: `${110 - shoulderHalf}px 104px` }}
            >
              <motion.rect
                animate={{
                  x: 110 - shoulderHalf - armWidth + 4,
                  width: armWidth,
                }}
                transition={spring}
                y="98"
                height="34"
                rx={armWidth / 2}
                fill={bodyFill}
                stroke={primaryColor}
                strokeWidth="2.5"
              />
            </motion.g>

            {/* Right Arm + Dumbbell Curl */}
            <motion.g
              animate={
                activeMode === 'flex'
                  ? { rotate: [-75, -112, -75] }
                  : activeMode === 'hop'
                  ? { rotate: [-120, -142, -120] }
                  : activeMode === 'dance'
                  ? { rotate: [-18, 10, -18, -52, -18] }
                  : activeMode === 'wave'
                  ? { rotate: [-10, -24, -10] }
                  : { rotate: showDumbbell ? [-16, -28, -16] : [-4, -12, -4] }
              }
              transition={{
                duration: activeMode === 'flex' ? 1.15 : 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ transformOrigin: `${110 + shoulderHalf}px 104px` }}
            >
              <motion.rect
                animate={{
                  x: 110 + shoulderHalf - 4,
                  width: armWidth,
                }}
                transition={spring}
                y="98"
                height="34"
                rx={armWidth / 2}
                fill={bodyFill}
                stroke={primaryColor}
                strokeWidth="2.5"
              />
              {showDumbbell && (
                <g transform={`translate(${110 + shoulderHalf + armWidth / 2}, 130)`}>
                  <rect x="-10" y="-2" width="20" height="4" rx="2" fill="#334155" />
                  <rect x="-13" y="-6" width="5" height="12" rx="2" fill="#0f172a" />
                  <rect x="8" y="-6" width="5" height="12" rx="2" fill="#0f172a" />
                </g>
              )}
            </motion.g>

            {/* Torso (morphs smoothly with BMI & Body Fat %) */}
            <motion.ellipse
              cx="110"
              cy="118"
              animate={{ rx: torsoRx, ry: 32 }}
              transition={spring}
              fill={bodyFill}
              stroke={primaryColor}
              strokeWidth="2.75"
            />

            {/* Cute Chest Checkmark Emblem */}
            <motion.path
              d="M 103 116 L 108 122 L 118 111"
              fill="none"
              stroke={primaryColor}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              animate={{
                opacity: moodVariant === 'energized' || celebrating ? 1 : 0.4,
                scale: activeMode === 'flex' ? [1, 1.14, 1] : 1,
              }}
              transition={{ duration: 1.2, repeat: Infinity }}
              style={{ transformOrigin: '110px 117px' }}
            />

            {/* Cute Head Group with Subtle Tilt & Sway */}
            <motion.g
              animate={
                activeMode === 'look'
                  ? { rotate: [-7, 7, -4, 0], x: [-2, 2, 0] }
                  : activeMode === 'wave'
                  ? { rotate: [-5, 4, -5] }
                  : activeMode === 'dance'
                  ? { rotate: [6, -6, 6] }
                  : { rotate: [-1.5, 1.5, -1.5] }
              }
              transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '110px 88px' }}
            >
              {/* Head */}
              <motion.ellipse
                cx="110"
                cy="66"
                animate={{ rx: clamp(27 + (bmi - 22) * 0.45, 24, 33), ry: 25 }}
                transition={spring}
                fill="#ffffff"
                stroke={primaryColor}
                strokeWidth="2.75"
              />

              {/* Swaying Sprout Leaf */}
              <motion.path
                d="M 110 41 Q 110 29 119 27 Q 116 37 110 41 Z"
                fill="#10b981"
                stroke="#059669"
                strokeWidth="1.5"
                animate={{ rotate: [-10, 14, -10] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                style={{ transformOrigin: '110px 41px' }}
              />

              {/* Athletic Headband when muscle / SMI is strong */}
              {hasAthleticBand && (
                <motion.rect
                  initial={{ opacity: 0, scaleX: 0.8 }}
                  animate={{ opacity: 1, scaleX: 1 }}
                  x="83"
                  y="47"
                  width="54"
                  height="6"
                  rx="3"
                  fill="#059669"
                />
              )}

              {/* Expressive Eyes: Happy Arcs, Curious Looking, Blinking, or Sleepy */}
              <motion.g
                animate={
                  activeMode === 'look'
                    ? { x: [-3.5, 3.5, -2.5, 0], scaleY: [1, 1, 0.15, 1] }
                    : { x: 0, scaleY: [1, 1, 0.1, 1] }
                }
                transition={{
                  duration: activeMode === 'look' ? 2.6 : 3.6,
                  repeat: Infinity,
                  times: [0, 0.86, 0.93, 1],
                }}
                style={{ transformOrigin: '110px 65px' }}
              >
                {moodVariant === 'sleepy' && activeMode === 'idle' && !tapCaption ? (
                  <>
                    <path
                      d="M 95 66 Q 99 69 103 66"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 117 66 Q 121 69 125 66"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                    />
                  </>
                ) : happyEyes ? (
                  <>
                    <path
                      d="M 95 66 Q 99 61 103 66"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M 117 66 Q 121 61 125 66"
                      fill="none"
                      stroke="#0f172a"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                    />
                  </>
                ) : (
                  <>
                    <circle cx="99" cy="65" r="3.4" fill="#0f172a" />
                    <circle cx="121" cy="65" r="3.4" fill="#0f172a" />
                    <circle cx="100.2" cy="63.8" r="1.15" fill="#ffffff" />
                    <circle cx="122.2" cy="63.8" r="1.15" fill="#ffffff" />
                  </>
                )}
              </motion.g>

              {/* Rosy Blushing Cheeks */}
              <motion.ellipse
                cx="90"
                cy="72"
                rx="4.8"
                ry="2.7"
                fill="#fda4af"
                animate={{ opacity: happyEyes ? [0.65, 0.95, 0.65] : 0.65 }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />
              <motion.ellipse
                cx="130"
                cy="72"
                rx="4.8"
                ry="2.7"
                fill="#fda4af"
                animate={{ opacity: happyEyes ? [0.65, 0.95, 0.65] : 0.65 }}
                transition={{ duration: 1.4, repeat: Infinity }}
              />

              {/* Expressive Mouth */}
              {moodVariant === 'energized' || celebrating || activeMode === 'hop' ? (
                <path d="M 102 74 Q 110 83 118 74 Z" fill="#0f172a" />
              ) : activeMode === 'look' ? (
                <circle cx="110" cy="76" r="2.6" fill="#0f172a" />
              ) : moodVariant === 'stuffed' ? (
                <path
                  d="M 104 75 Q 110 78 116 75"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M 103 73 Q 110 80 117 73"
                  fill="none"
                  stroke="#0f172a"
                  strokeWidth="2.3"
                  strokeLinecap="round"
                />
              )}
            </motion.g>
          </motion.g>
        </svg>

        {/* Interactive Trick Controls */}
        <div
          className="mt-1 flex flex-wrap items-center justify-center gap-1.5 px-3"
          onClick={(e) => e.stopPropagation()}
        >
          {(
            [
              { id: 'wave', label: 'Wave' },
              { id: 'flex', label: 'Flex' },
              { id: 'hop', label: 'Jump' },
              { id: 'dance', label: 'Dance' },
            ] as const
          ).map((trick) => (
            <button
              key={trick.id}
              type="button"
              onClick={() => triggerTrick(trick.id)}
              className={`px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                activeMode === trick.id
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:text-slate-900 hover:border-slate-300'
              }`}
            >
              {trick.label}
            </button>
          ))}
        </div>

        {/* Live Tracked Metrics Readout (BMI · Body Fat % · Muscle Mass) */}
        {activeBody && activeIndexes ? (
          <div className="mt-2.5 text-center px-3">
            <div className="text-xs font-mono tabular-nums text-slate-800 font-medium">
              BMI {activeIndexes.bmi.toFixed(1)} · Fat {activeBody.bodyFatPct.toFixed(1)}% ·
              Muscle {activeBody.muscleMassKg.toFixed(1)} kg
            </div>
            {deltas && !showingPrev && (
              <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500">
                Change:{' '}
                <span className={deltas.bmi <= 0 ? 'text-emerald-700' : 'text-slate-700'}>
                  {deltas.bmi >= 0 ? '+' : ''}
                  {deltas.bmi} BMI
                </span>
                {' · '}
                <span className={deltas.fat <= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                  {deltas.fat >= 0 ? '+' : ''}
                  {deltas.fat}% fat
                </span>
                {' · '}
                <span className={deltas.muscle >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                  {deltas.muscle >= 0 ? '+' : ''}
                  {deltas.muscle} kg muscle
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-2 text-xs text-slate-500 px-4 text-center">
            Log BMI, body fat %, and muscle mass to morph your KinBuddy
          </div>
        )}
      </div>
    </div>
  );
};
