/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useState } from 'react';
import {
  Camera,
  LayoutDashboard,
  LogOut,
  Menu,
  Scale,
  SlidersHorizontal,
  Users,
  Utensils,
  X,
} from 'lucide-react';
import { AiFoodModal } from './components/AiFoodModal';
import { AuthGate } from './components/AuthGate';
import { BodyCompView } from './components/BodyCompView';
import { BodyLogModal } from './components/BodyLogModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FoodLogView } from './components/FoodLogView';
import { OverviewView } from './components/OverviewView';
import { PartnerCompareView } from './components/PartnerCompareView';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { TargetsSettingsView } from './components/TargetsSettingsView';
import { signOutUser } from './firebase';
import { useHouseholdData } from './hooks/useHouseholdData';
import type { CreateFoodInput } from './hooks/useHouseholdData';
import type { ActiveTab, FoodLog } from './types';
import { getLocalDateStr } from './types';

function MainApp() {
  const {
    user,
    authReady,
    userProfile,
    profileLoading,
    household,
    members,
    otherMembers,
    myProfile,
    foodLogs,
    foodPresets,
    bodyLogs,
    actionError,
    createHousehold,
    joinHouseholdByCode,
    switchToGroupByCode,
    updateMyTargets,
    addFoodLog,
    updateFoodLog,
    deleteFoodLog,
    addFoodPreset,
    deleteFoodPreset,
    logFromPreset,
    addBodyLog,
    deleteBodyLog,
    leaveHousehold,
  } = useHouseholdData();

  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateStr());
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [foodModalOpen, setFoodModalOpen] = useState(false);
  const [foodModalMode, setFoodModalMode] = useState<'ai' | 'manual' | 'presets'>('ai');
  const [editingFoodLog, setEditingFoodLog] = useState<FoodLog | null>(null);
  const [bodyModalOpen, setBodyModalOpen] = useState(false);
  const [justUpdatedBodyTick, setJustUpdatedBodyTick] = useState(0);

  const initialInviteCode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }, []);

  const myLatestBody = useMemo(
    () => (myProfile ? bodyLogs.find((b) => b.uid === myProfile.uid) ?? null : null),
    [bodyLogs, myProfile]
  );

  if (!authReady || !user || profileLoading || !userProfile?.householdId || !household || !myProfile) {
    return (
      <AuthGate
        user={user}
        authReady={authReady}
        profileLoading={profileLoading}
        actionError={actionError}
        initialInviteCode={initialInviteCode}
        onCreateHousehold={createHousehold}
        onJoinHousehold={joinHouseholdByCode}
      />
    );
  }

  const openFoodModal = (
    editLog?: FoodLog,
    initialMode: 'ai' | 'manual' | 'presets' = 'ai'
  ) => {
    setEditingFoodLog(editLog ?? null);
    setFoodModalMode(editLog ? 'manual' : initialMode);
    setFoodModalOpen(true);
  };

  const handleSaveFood = async (input: CreateFoodInput, editingId?: string) => {
    if (editingId) {
      await updateFoodLog(editingId, input);
    } else {
      await addFoodLog(input);
    }
  };

  const handleSaveLogAsPreset = async (log: FoodLog) => {
    await addFoodPreset({
      name: log.name,
      mealType: log.mealType,
      servingNote: log.servingNote,
      calories: log.calories,
      proteinG: log.proteinG,
      carbsG: log.carbsG,
      fatG: log.fatG,
      fiberG: log.fiberG,
    });
  };

  const navItems: {
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: typeof LayoutDashboard;
  }[] = [
    { id: 'overview', label: 'Daily Overview', shortLabel: 'Home', icon: LayoutDashboard },
    { id: 'food', label: 'Food & AI Camera', shortLabel: 'Food', icon: Utensils },
    { id: 'body', label: 'BMI & Body', shortLabel: 'Body', icon: Scale },
    {
      id: 'compare',
      label: otherMembers.length > 0 ? 'Group Compare' : 'Group & Partner',
      shortLabel: 'Group',
      icon: Users,
    },
    { id: 'targets', label: 'Targets & Group', shortLabel: 'Targets', icon: SlidersHorizontal },
  ];

  const activeLabel = navItems.find((n) => n.id === activeTab)?.label ?? 'Overview';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileNavOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-slate-200 flex flex-col justify-between transition-transform duration-200 lg:static lg:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="h-14 px-5 border-b border-slate-200 flex items-center justify-between">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
              KinHealth
            </span>
            <button
              type="button"
              onClick={() => setMobileNavOpen(false)}
              aria-label="Close navigation"
              className="p-1.5 text-slate-500 hover:text-slate-900 lg:hidden"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="px-4 py-4 border-b border-slate-100">
            <div className="text-xs font-medium text-slate-900 truncate">
              {household.name}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 truncate">
              {members.length === 1
                ? `${myProfile.displayName} · Solo`
                : `${members.length} members`}
            </div>
          </div>

          <nav className="p-3 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileNavOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-slate-200 space-y-3">
          <div className="text-xs">
            <div className="font-semibold text-slate-900 truncate">
              {myProfile.displayName}
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              {myProfile.calorieTarget} kcal · {myProfile.proteinTargetG}g protein
            </div>
          </div>
          <button
            type="button"
            onClick={() => void signOutUser()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="pt-safe bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="h-14 px-4 sm:px-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open navigation"
                className="p-1.5 text-slate-600 hover:text-slate-900 lg:hidden"
              >
                <Menu className="w-5 h-5" />
              </button>
              <div className="text-sm font-medium text-slate-900 truncate">
                {activeLabel}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <PWAInstallButton />
              <button
                type="button"
                onClick={() => openFoodModal()}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition-colors whitespace-nowrap shrink-0"
              >
                <Camera className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Snap Meal Photo</span>
                <span className="sm:hidden">Snap Meal</span>
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 lg:pb-8 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <OverviewView
              household={household}
              myProfile={myProfile}
              otherMembers={otherMembers}
              foodLogs={foodLogs}
              foodPresets={foodPresets}
              bodyLogs={bodyLogs}
              selectedDate={selectedDate}
              justUpdatedBodyTick={justUpdatedBodyTick}
              onSelectDate={setSelectedDate}
              onOpenFoodModal={openFoodModal}
              onOpenBodyModal={() => setBodyModalOpen(true)}
              onDeleteFoodLog={deleteFoodLog}
              onLogPreset={(preset, date) => logFromPreset(preset, date, 1)}
              onSaveLogAsPreset={handleSaveLogAsPreset}
              onNavigateTab={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'food' && (
            <FoodLogView
              myProfile={myProfile}
              members={members}
              foodLogs={foodLogs}
              foodPresets={foodPresets}
              selectedDate={selectedDate}
              onOpenFoodModal={openFoodModal}
              onDeleteFoodLog={deleteFoodLog}
              onLogPreset={(preset, date) => logFromPreset(preset, date, 1)}
              onDeletePreset={deleteFoodPreset}
              onSaveLogAsPreset={handleSaveLogAsPreset}
            />
          )}

          {activeTab === 'body' && (
            <BodyCompView
              myProfile={myProfile}
              otherMembers={otherMembers}
              foodLogs={foodLogs}
              bodyLogs={bodyLogs}
              justUpdatedBodyTick={justUpdatedBodyTick}
              onOpenBodyModal={() => setBodyModalOpen(true)}
              onDeleteBodyLog={deleteBodyLog}
            />
          )}

          {activeTab === 'compare' && (
            <PartnerCompareView
              household={household}
              myProfile={myProfile}
              members={members}
              otherMembers={otherMembers}
              foodLogs={foodLogs}
              bodyLogs={bodyLogs}
              selectedDate={selectedDate}
              actionError={actionError}
              onSwitchToGroup={switchToGroupByCode}
            />
          )}

          {activeTab === 'targets' && (
            <TargetsSettingsView
              household={household}
              myProfile={myProfile}
              members={members}
              otherMembers={otherMembers}
              isOwner={household.ownerId === user.uid}
              actionError={actionError}
              onSaveTargets={updateMyTargets}
              onSwitchToGroup={switchToGroupByCode}
              onLeaveHousehold={leaveHousehold}
            />
          )}
        </main>
      </div>

      <AiFoodModal
        isOpen={foodModalOpen}
        defaultDate={selectedDate}
        initialMode={foodModalMode}
        editingLog={editingFoodLog}
        foodPresets={foodPresets}
        currentUserUid={user.uid}
        memberCount={members.length}
        onClose={() => {
          setFoodModalOpen(false);
          setEditingFoodLog(null);
        }}
        onSave={handleSaveFood}
        onCreatePreset={addFoodPreset}
        onDeletePreset={deleteFoodPreset}
        onLogPreset={logFromPreset}
      />

      <BodyLogModal
        isOpen={bodyModalOpen}
        heightCm={myProfile.heightCm}
        latestBodyLog={myLatestBody}
        onClose={() => setBodyModalOpen(false)}
        onSave={async (input) => {
          await addBodyLog(input);
          setJustUpdatedBodyTick((t) => t + 1);
        }}
      />

      {/* iPhone / Mobile Bottom Tab Bar */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200 pb-safe"
      >
        <div className="grid grid-cols-5 h-14">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors ${
                  isActive ? 'text-emerald-700' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </nav>

      <OfflineIndicator />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainApp />
    </ErrorBoundary>
  );
}
