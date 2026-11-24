import { useState } from 'react';
import {
  Anchor,
  ChevronDown,
  ChevronUp,
  Compass,
  Eye,
  Map,
  Pause,
  Radio,
  Sun,
  Volume2,
  VolumeX,
  Wind,
  Wrench,
  Zap,
} from 'lucide-react';
import type {
  AutopilotMode,
  CameraViewMode,
  ReefLevel,
  SimulationState,
} from '../types/sailing';
import { BOAT_SPECS } from '../sim/boats';
import { buildNmeaSentences } from '../sim/nmea';
import { getOptimalSheetPct } from '../sim/physics';

export type DockTab = 'helm' | 'weather' | 'cabin' | 'anchor';

interface SailingHUDProps {
  sim: SimulationState;
  cameraMode: CameraViewMode;
  muted: boolean;
  dockCollapsed: boolean;
  hoverTooltip: { label: string; x: number; y: number } | null;
  onToggleDock: () => void;
  onSetCameraMode: (mode: CameraViewMode) => void;
  onToggleMute: () => void;
  onPause: () => void;
  onOpenWorldChart: () => void;
  onOpenChandlery: () => void;
  onSteerStep: (deltaDeg: number) => void;
  onSetMainsheet: (pct: number) => void;
  onSetJibsheet: (pct: number) => void;
  onToggleJib: () => void;
  onSetReef: (level: ReefLevel) => void;
  onSetSimRealism: (val: number) => void;
  onSetAutopilot: (mode: AutopilotMode) => void;
  onSetTimeCompression: (speed: 1 | 10 | 60) => void;
  onSleepWatch: (hours: number) => void;
  onTriggerSquallDemo: () => void;
  onToggleElectrical: (key: 'navLights' | 'cabinLights' | 'vhfRadio' | 'instruments' | 'fridgeOn' | 'bilgePump') => void;
  onToggleAnchor: () => void;
  onSetRodeLength: (meters: number) => void;
  onCompletePassage: () => void;
}

export function SailingHUD({
  sim,
  cameraMode,
  muted,
  dockCollapsed,
  hoverTooltip,
  onToggleDock,
  onSetCameraMode,
  onToggleMute,
  onPause,
  onOpenWorldChart,
  onOpenChandlery,
  onSteerStep,
  onSetMainsheet,
  onSetJibsheet,
  onToggleJib,
  onSetReef,
  onSetSimRealism,
  onSetAutopilot,
  onSetTimeCompression,
  onSleepWatch,
  onTriggerSquallDemo,
  onToggleElectrical,
  onToggleAnchor,
  onSetRodeLength,
  onCompletePassage,
}: SailingHUDProps) {
  const [activeTab, setActiveTab] = useState<DockTab>('helm');
  const spec = BOAT_SPECS[sim.boatId];
  const distRemaining = Math.max(0, Math.round(sim.passage.totalDistanceNm - sim.passage.xNm));
  const optimalTrim = getOptimalSheetPct(Math.abs(sim.apparentWindAngleDeg));
  const batteryPct = Math.round((sim.electrical.batteryAh / Math.max(1, sim.electrical.batteryCapacityAh)) * 100);

  return (
    <div className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4">
      {/* Top Row: Compact Telemetry Strip (Left) + Utility Controls (Right) */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Instrument Readout */}
        <div className="pointer-events-auto bg-slate-950/90 border border-slate-700/70 rounded-xl px-4 py-2.5 shadow-xl max-w-2xl">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Vessel</div>
              <div className="text-xs font-semibold text-slate-100 whitespace-nowrap">{spec.name}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Heading</div>
              <div className="font-mono-tabular text-base font-semibold text-slate-50">
                {String(Math.round(sim.headingDeg)).padStart(3, '0')}°
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">STW / SOG</div>
              <div className="font-mono-tabular text-base font-semibold text-amber-400">
                {sim.electrical.instruments
                  ? `${sim.boatSpeedKts.toFixed(1)} / ${(sim.sogKts ?? sim.boatSpeedKts).toFixed(1)} kt`
                  : '--'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Wind (AWA / TWS)</div>
              <div className="font-mono-tabular text-sm font-medium text-sky-300">
                {sim.electrical.instruments
                  ? `${Math.round(sim.apparentWindAngleDeg)}° · ${Math.round(sim.weather.trueWindSpeedKts)} kt`
                  : '--'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Depth</div>
              <div
                className={`font-mono-tabular text-sm font-medium ${
                  sim.passage.channelHazardWarning ? 'text-red-400' : 'text-slate-200'
                }`}
              >
                {sim.electrical.instruments ? `${sim.passage.depthM.toFixed(1)} m` : '--'}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">To {sim.passage.toName.split('(')[0].trim()}</div>
              <div className="font-mono-tabular text-sm font-semibold text-emerald-400">
                {distRemaining} NM
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-400">Barometer</div>
              <div
                className={`font-mono-tabular text-sm font-medium ${
                  sim.weather.phase === 'squall' || sim.weather.phase === 'barometer-falling'
                    ? 'text-red-400'
                    : 'text-slate-200'
                }`}
              >
                {Math.round(sim.weather.barometerHpa)} hPa
              </div>
            </div>
          </div>

          {sim.alertMessage && (
            <div className="mt-2 pt-1.5 border-t border-slate-800 text-xs text-amber-300 font-medium">
              {sim.alertMessage}
            </div>
          )}
        </div>

        {/* Top-Right Camera & Utility Actions */}
        <div className="pointer-events-auto flex flex-wrap items-center justify-end gap-2">
          <div className="flex items-center bg-slate-950/90 border border-slate-700/70 rounded-lg p-1 gap-1">
            {(
              [
                { id: 'third-person', label: '3rd Person' },
                { id: 'first-person-helm', label: 'Helm' },
                { id: 'first-person-cabin', label: 'Cabin' },
              ] as Array<{ id: CameraViewMode; label: string }>
            ).map((cam) => (
              <button
                key={cam.id}
                type="button"
                onClick={() => onSetCameraMode(cam.id)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  cameraMode === cam.id
                    ? 'bg-amber-500 text-slate-950 font-semibold'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5 inline mr-1" aria-hidden="true" />
                {cam.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenWorldChart}
            className="px-3 py-2 rounded-lg bg-slate-950/90 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-100 whitespace-nowrap cursor-pointer"
          >
            <Map className="w-3.5 h-3.5 inline mr-1.5 text-amber-400" aria-hidden="true" />
            World Route
          </button>

          <button
            type="button"
            onClick={onOpenChandlery}
            className="px-3 py-2 rounded-lg bg-slate-950/90 hover:bg-slate-800 border border-slate-700/70 text-xs font-medium text-slate-100 whitespace-nowrap cursor-pointer"
          >
            <Wrench className="w-3.5 h-3.5 inline mr-1.5 text-amber-400" aria-hidden="true" />
            Chandlery
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute Audio' : 'Mute Audio'}
            className="p-2 rounded-lg bg-slate-950/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 cursor-pointer"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="Pause Simulation"
            className="p-2 rounded-lg bg-slate-950/90 hover:bg-slate-800 border border-slate-700/70 text-slate-200 cursor-pointer"
          >
            <Pause className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* 3D Hover Tooltip */}
      {hoverTooltip && (
        <div
          className="fixed z-30 pointer-events-none px-2.5 py-1 rounded bg-slate-950/95 border border-amber-400/60 text-xs text-amber-200 shadow-lg"
          style={{ left: hoverTooltip.x + 14, top: hoverTooltip.y - 28 }}
        >
          Click: {hoverTooltip.label}
        </div>
      )}

      {/* Collapsible Unified Bottom Maritime Control Dock */}
      <div className="flex flex-col items-center w-full">
        <button
          type="button"
          onClick={onToggleDock}
          className="pointer-events-auto mb-1.5 px-3.5 py-1 rounded-t-lg bg-slate-950/90 border border-b-0 border-slate-700/70 text-xs font-medium text-slate-300 hover:text-white flex items-center gap-1.5 cursor-pointer"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Show Controls [H]</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Hide Controls [H]</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-4xl bg-slate-950/92 border border-slate-700/80 rounded-xl shadow-2xl overflow-hidden">
            {/* Tab Bar + Quick Status */}
            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-slate-800 bg-slate-900/60">
              <div className="flex items-center gap-1" role="tablist" aria-label="Vessel Control Sections">
                {(
                  [
                    { id: 'helm', label: 'Helm & Sails', icon: Compass },
                    { id: 'weather', label: 'Weather & Watch', icon: Wind },
                    { id: 'cabin', label: 'Cabin & Power', icon: Zap },
                    { id: 'anchor', label: 'Anchor & Tide', icon: Anchor },
                  ] as Array<{ id: DockTab; label: string; icon: typeof Compass }>
                ).map((t) => {
                  const Icon = t.icon;
                  const active = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setActiveTab(t.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                        active
                          ? 'bg-amber-500 text-slate-950 font-semibold'
                          : 'text-slate-300 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              <div className="text-[11px] text-slate-400 font-mono-tabular flex items-center gap-3">
                <span>
                  {sim.pointOfSail}
                  {sim.maneuverState && sim.maneuverState !== 'sailing'
                    ? ` · ${sim.maneuverState.toUpperCase()}`
                    : ''}
                </span>
                <span>AoA {Math.round(sim.angleOfAttackDeg ?? 20)}° · Lift {sim.sailLiftN ?? 0}N</span>
                <span>Heel {Math.abs(Math.round(sim.heelDeg))}°</span>
                <span>Bat {batteryPct}%</span>
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-4">
              {activeTab === 'helm' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* Rudder & Reefing */}
                  <div className="md:col-span-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => onSteerStep(-8)}
                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
                      >
                        ← Port [A]
                      </button>
                      <button
                        type="button"
                        onClick={() => onSteerStep(8)}
                        className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-100 cursor-pointer"
                      >
                        Stbd [D] →
                      </button>
                    </div>

                    <div>
                      <div className="text-[11px] text-slate-400 mb-1">Mainsail Reefing [R]</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {([0, 1, 2] as ReefLevel[]).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => onSetReef(lvl)}
                            className={`py-1.5 rounded text-xs font-medium border cursor-pointer ${
                              sim.reefLevel === lvl
                                ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                            }`}
                          >
                            {lvl === 0 ? 'Full' : `Reef ${lvl}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mainsheet & Jibsheet Trim */}
                  <div className="md:col-span-5 space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <label htmlFor="mainsheet-slider" className="text-slate-300 font-medium">
                          Mainsheet Trim
                        </label>
                        <span className="font-mono-tabular text-slate-400">
                          {sim.mainsheetPct}% (Opt {optimalTrim}%)
                        </span>
                      </div>
                      <input
                        id="mainsheet-slider"
                        type="range"
                        min={5}
                        max={100}
                        value={sim.mainsheetPct}
                        onChange={(e) => onSetMainsheet(Number(e.target.value))}
                        className="w-full maritime-slider"
                      />
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <label htmlFor="jibsheet-slider" className="text-slate-300 font-medium">
                          Jib Sheet
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular text-slate-400">{sim.jibsheetPct}%</span>
                          <button
                            type="button"
                            onClick={onToggleJib}
                            className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200 cursor-pointer"
                          >
                            {sim.jibDeployed ? 'Furl Jib' : 'Unfurl Jib'}
                          </button>
                        </div>
                      </div>
                      <input
                        id="jibsheet-slider"
                        type="range"
                        min={5}
                        max={100}
                        disabled={!sim.jibDeployed}
                        value={sim.jibsheetPct}
                        onChange={(e) => onSetJibsheet(Number(e.target.value))}
                        className="w-full maritime-slider"
                      />
                    </div>
                  </div>

                  {/* Arcade <-> Simulation Realism Slider */}
                  <div className="md:col-span-3 bg-slate-900/70 border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <label htmlFor="realism-slider" className="font-semibold text-slate-200">
                        Physics Mode
                      </label>
                      <span className="font-mono-tabular text-amber-400">
                        {Math.round(sim.simRealism * 100)}% Sim
                      </span>
                    </div>
                    <input
                      id="realism-slider"
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(sim.simRealism * 100)}
                      onChange={(e) => onSetSimRealism(Number(e.target.value) / 100)}
                      className="w-full maritime-slider mb-1"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Arcade</span>
                      <span>Full Simulation</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'weather' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* VHF Weatherfax */}
                  <div className="md:col-span-5 bg-slate-900/80 border border-slate-800 rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
                        <Radio className="w-3.5 h-3.5" aria-hidden="true" />
                        VHF Ch 16 Weatherfax
                      </span>
                      <span className="font-mono-tabular text-slate-400">
                        {sim.weather.barometerTrend}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {sim.electrical.vhfRadio
                        ? sim.weather.forecastText
                        : 'VHF Radio breaker is OFF. Switch on VHF in Cabin/Power to receive forecasts.'}
                    </p>
                  </div>

                  {/* Autopilot & Windvane */}
                  <div className="md:col-span-3 space-y-2">
                    <div className="text-[11px] text-slate-400">Self-Steering / Autopilot</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['manual', 'windvane', 'compass'] as AutopilotMode[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => onSetAutopilot(mode)}
                          className={`py-1.5 px-1 rounded text-[11px] font-medium border capitalize cursor-pointer ${
                            sim.autopilotMode === mode
                              ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                              : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-slate-500'
                          }`}
                        >
                          {mode === 'windvane' ? 'Windvane' : mode}
                        </button>
                      ))}
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {sim.autopilotMode === 'windvane'
                        ? `Holding AWA ${Math.round(sim.autopilotTargetDeg)}° (0W draw)`
                        : sim.autopilotMode === 'compass'
                          ? `Holding HDG ${Math.round(sim.autopilotTargetDeg)}° (26W draw)`
                          : 'Hand steering active'}
                    </div>
                  </div>

                  {/* Time Compression, Sleep Watch & Squall Trigger */}
                  <div className="md:col-span-4 space-y-2">
                    <div className="flex items-center gap-1.5">
                      {([1, 10, 60] as const).map((spd) => (
                        <button
                          key={spd}
                          type="button"
                          onClick={() => onSetTimeCompression(spd)}
                          className={`flex-1 py-1.5 rounded text-xs font-mono-tabular border cursor-pointer ${
                            sim.timeCompression === spd
                              ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                              : 'bg-slate-900 border-slate-700 text-slate-300'
                          }`}
                        >
                          {spd}x
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSleepWatch(4)}
                        className="flex-1 py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-slate-100 cursor-pointer"
                      >
                        Sleep 4h Watch
                      </button>
                      <button
                        type="button"
                        onClick={onTriggerSquallDemo}
                        className="py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/60 text-xs font-medium text-amber-200 cursor-pointer"
                      >
                        Test Squall
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'cabin' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  {/* Clickable 12V Breakers */}
                  <div className="md:col-span-6">
                    <div className="text-[11px] text-slate-400 mb-2">
                      12V DC Breaker Switches (also clickable inside 3D Cabin view)
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { key: 'navLights', label: 'Nav Lights' },
                          { key: 'cabinLights', label: 'Cabin Lights' },
                          { key: 'vhfRadio', label: 'VHF Radio' },
                          { key: 'instruments', label: 'Instruments' },
                          { key: 'fridgeOn', label: 'Galley Fridge' },
                          { key: 'bilgePump', label: 'Bilge Pump' },
                        ] as const
                      ).map((sw) => {
                        const on = sim.electrical[sw.key];
                        return (
                          <button
                            key={sw.key}
                            type="button"
                            onClick={() => onToggleElectrical(sw.key)}
                            className={`px-2.5 py-1.5 rounded text-xs font-medium border transition-colors cursor-pointer text-left flex items-center justify-between ${
                              on
                                ? 'bg-emerald-950/60 border-emerald-500/70 text-emerald-200'
                                : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            <span className="truncate">{sw.label}</span>
                            <span className="font-mono-tabular text-[10px]">{on ? 'ON' : 'OFF'}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Solar, Battery, Fridge & Live NMEA 0183 Telemetry */}
                  <div className="md:col-span-6 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <Sun className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                          <span>Solar / Load</span>
                        </div>
                        <div className="font-mono-tabular text-xs font-semibold text-slate-100 mt-0.5">
                          +{sim.electrical.solarWatts}W / -{sim.electrical.drawWatts}W
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-400">
                          {sim.electrical.voltage.toFixed(1)}V · {Math.round(sim.electrical.batteryAh)}Ah
                        </div>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                        <div className="text-[11px] text-slate-400">Galley Fridge</div>
                        <div
                          className={`font-mono-tabular text-xs font-semibold mt-0.5 ${
                            sim.electrical.fridgeTempC > 9 ? 'text-red-400' : 'text-sky-300'
                          }`}
                        >
                          {sim.electrical.fridgeTempC.toFixed(1)}°C
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-400">
                          {sim.electrical.provisionsDays.toFixed(1)}d · {Math.round(sim.electrical.waterLiters)}L
                        </div>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2">
                        <div className="text-[11px] text-slate-400">Rig & Hull</div>
                        <div className="font-mono-tabular text-xs font-semibold text-slate-100 mt-0.5">
                          Main {Math.round(sim.wear.mainsail)}%
                        </div>
                        <div className="font-mono-tabular text-[11px] text-slate-400">
                          Rig {Math.round(sim.wear.rigging)}% · Hull {Math.round(sim.wear.hull)}%
                        </div>
                      </div>
                    </div>

                    {/* NMEA 0183 Bus Readout */}
                    {(() => {
                      if (!sim.electrical.instruments) {
                        return (
                          <div className="bg-slate-900/70 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono-tabular text-[10px] text-slate-500">
                            NMEA 0183 BUS: Switch on Instruments breaker for live GPS/Wind/Depth feed.
                          </div>
                        );
                      }
                      const nmea = buildNmeaSentences(sim);
                      return (
                        <div className="bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono-tabular text-[10px] text-emerald-300/90 leading-snug">
                          <div className="text-slate-400 mb-0.5">
                            NMEA 0183 · {nmea.latStr} {nmea.lonStr} · COG {Math.round(sim.cogDeg ?? sim.headingDeg)}°
                          </div>
                          <div className="truncate">{nmea.gprmc}</div>
                          <div className="truncate text-sky-300/90">{nmea.iimwv} · {nmea.iidpt}</div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {activeTab === 'anchor' && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-4 space-y-2">
                    <button
                      type="button"
                      onClick={onToggleAnchor}
                      className={`w-full py-2 px-4 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                        sim.anchor.deployed
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                      }`}
                    >
                      {sim.anchor.deployed ? 'Weigh Anchor (Raise)' : 'Drop Anchor in Cove'}
                    </button>
                    <div>
                      <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                        <label htmlFor="rode-slider">Chain Rode Scope</label>
                        <span className="font-mono-tabular text-slate-200">{sim.anchor.rodeLengthM}m</span>
                      </div>
                      <input
                        id="rode-slider"
                        type="range"
                        min={25}
                        max={85}
                        value={sim.anchor.rodeLengthM}
                        onChange={(e) => onSetRodeLength(Number(e.target.value))}
                        className="w-full maritime-slider"
                      />
                    </div>
                  </div>

                  <div className="md:col-span-5 grid grid-cols-3 gap-2">
                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-400">Tide State</div>
                      <div className="text-xs font-semibold text-sky-300 mt-0.5">
                        {sim.anchor.tidePhaseLabel}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-400">
                        {sim.anchor.tideHeightM >= 0 ? '+' : ''}
                        {sim.anchor.tideHeightM.toFixed(2)}m
                      </div>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-400">Tidal Swing</div>
                      <div className="font-mono-tabular text-xs font-semibold text-slate-100 mt-0.5">
                        {Math.round(sim.anchor.swingAngleDeg)}° Arc
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-400">
                        Stream {sim.anchor.tidalCurrentKts.toFixed(1)} kt
                      </div>
                    </div>

                    <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5">
                      <div className="text-[11px] text-slate-400">Holding</div>
                      <div
                        className={`font-mono-tabular text-xs font-semibold mt-0.5 ${
                          sim.anchor.dragging ? 'text-red-400' : 'text-emerald-400'
                        }`}
                      >
                        {sim.anchor.dragging ? 'DRAGGING' : `${Math.round(sim.anchor.holdingFactor * 100)}% ${sim.anchor.holdingQuality}`}
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-400">
                        Depth {Math.round(sim.passage.depthM)}m
                      </div>
                    </div>
                  </div>

                  <div className="md:col-span-3 flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={onOpenChandlery}
                      className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-medium text-slate-100 cursor-pointer"
                    >
                      Dockside Chandlery
                    </button>
                    {sim.passage.arrivedAtCove && sim.anchor.deployed && (
                      <button
                        type="button"
                        onClick={onCompletePassage}
                        className="w-full py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold cursor-pointer"
                      >
                        Log Passage Complete
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
