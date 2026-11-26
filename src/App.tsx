import { useCallback, useEffect, useRef, useState } from 'react';
import { SailingAudioEngine } from './audio/sailingAudio';
import { ChandleryModal } from './components/ChandleryModal';
import { SailingHUD } from './components/SailingHUD';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { WorldChartModal } from './components/WorldChartModal';
import {
  acceptCharterContract,
  applySparePartRepair,
  buyChandleryItem,
  clamp,
  createInitialSimulationState,
  deployOrRaiseAnchor,
  migrateSaveState,
  normalizeAngle180,
  resetVesselCfg,
  resolveDistressRecovery,
  settlePassageCompletion,
  simulateWatchSleep,
  stepSimulation,
  stepSimulationWithAccumulator,
  switchOrPurchaseBoat,
  updateVesselCfg,
} from './sim/physics';
import { getRealismProfile } from './sim/realism';
import { BOAT_SPECS } from './sim/boats';
import type { InteractiveAction } from './three/boatBuilder';
import { SailingSceneController } from './three/oceanScene';
import type {
  AutopilotMode,
  BoatId,
  CameraViewMode,
  GameScreenState,
  ReefLevel,
  SimulationState,
  WorldHub,
} from './types/sailing';

const STORAGE_KEY = 'meridian_passage_save_v2';
const LEGACY_STORAGE_KEY = 'meridian_passage_save_v1';

function loadInitialState(): SimulationState {
  try {
    const rawV2 = localStorage.getItem(STORAGE_KEY);
    if (rawV2) {
      return migrateSaveState(JSON.parse(rawV2));
    }
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const migrated = migrateSaveState(JSON.parse(rawV1));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Ignore corrupt local storage
  }
  return createInitialSimulationState('elan-19');
}

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const [screenState, setScreenState] = useState<GameScreenState>(
    autostart ? 'playing' : 'title',
  );
  const [cameraMode, setCameraMode] = useState<CameraViewMode>('third-person');
  const [sim, setSim] = useState<SimulationState>(() => loadInitialState());
  const [muted, setMuted] = useState(false);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [worldChartOpen, setWorldChartOpen] = useState(false);
  const [chandleryOpen, setChandleryOpen] = useState(false);
  const [touchPadEnabled, setTouchPadEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(
      window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth <= 1024,
    );
  });
  const [hoverTooltip, setHoverTooltip] = useState<{ label: string; x: number; y: number } | null>(
    null,
  );

  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const simRef = useRef<SimulationState>(sim);
  const physAccumRef = useRef<number>(0);
  const screenRef = useRef<GameScreenState>(screenState);
  const cameraModeRef = useRef<CameraViewMode>(cameraMode);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const virtualSteerRef = useRef<-1 | 0 | 1>(0);
  const audioRef = useRef<SailingAudioEngine | null>(null);
  const lastHudSyncRef = useRef<number>(0);
  const lastSaveRef = useRef<number>(0);

  // Keep refs synchronized with React state
  useEffect(() => {
    screenRef.current = screenState;
    document.body.dataset.state = screenState;
    if (screenState !== 'playing') {
      setHoverTooltip(null);
      virtualSteerRef.current = 0;
    }
  }, [screenState]);

  useEffect(() => {
    cameraModeRef.current = cameraMode;
  }, [cameraMode]);

  const commitSim = useCallback((next: SimulationState, syncReact = true) => {
    simRef.current = next;
    if (syncReact) {
      setSim(next);
    }
    const now = performance.now();
    if (now - lastSaveRef.current > 1500) {
      lastSaveRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
    }
  }, []);

  const handleStart = useCallback(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    keysPressedRef.current.clear();
    audioRef.current?.ensureStarted();
    setScreenState('playing');
  }, []);

  const handleToggleElectrical = useCallback(
    (key: 'navLights' | 'cabinLights' | 'vhfRadio' | 'instruments' | 'fridgeOn' | 'bilgePump') => {
      audioRef.current?.playSwitchClick();
      const prev = simRef.current;
      const nextVal = !prev.electrical[key];
      const next: SimulationState = {
        ...prev,
        electrical: {
          ...prev.electrical,
          [key]: nextVal,
        },
        lastLogEntry: `${key} switched ${nextVal ? 'ON' : 'OFF'}.`,
      };
      if (key === 'vhfRadio' && nextVal) {
        audioRef.current?.playVhfChime();
      }
      commitSim(next);
    },
    [commitSim],
  );

  const handleCycleReef = useCallback(
    (explicit?: ReefLevel) => {
      audioRef.current?.playWinchRatchet();
      const prev = simRef.current;
      const nextReef: ReefLevel =
        explicit !== undefined ? explicit : (((prev.reefLevel + 1) % 3) as ReefLevel);
      commitSim({
        ...prev,
        reefLevel: nextReef,
        lastLogEntry:
          nextReef === 0
            ? 'Mainsail hoisted to Full.'
            : `Mainsail slab-reefed to Reef ${nextReef}.`,
      });
    },
    [commitSim],
  );

  const handleToggleAnchor = useCallback(() => {
    audioRef.current?.playAnchorDrop();
    commitSim(deployOrRaiseAnchor(simRef.current));
  }, [commitSim]);

  const handleSetAutopilot = useCallback(
    (mode: AutopilotMode) => {
      audioRef.current?.playSwitchClick();
      const prev = simRef.current;
      const target =
        mode === 'windvane'
          ? prev.apparentWindAngleDeg
          : mode === 'compass'
            ? prev.headingDeg
            : prev.autopilotTargetDeg;
      commitSim({
        ...prev,
        autopilotMode: mode,
        autopilotTargetDeg: target,
        lastLogEntry:
          mode === 'windvane'
            ? `Windvane self-steering engaged at ${Math.round(target)}° AWA.`
            : mode === 'compass'
              ? `Compass autopilot locked on ${Math.round(target)}°.`
              : 'Returned to manual helm.',
      });
    },
    [commitSim],
  );

  const handleInteract3D = useCallback(
    (action: InteractiveAction) => {
      const prev = simRef.current;
      switch (action) {
        case 'toggle-nav-lights':
          handleToggleElectrical('navLights');
          break;
        case 'toggle-cabin-lights':
          handleToggleElectrical('cabinLights');
          break;
        case 'toggle-vhf':
          handleToggleElectrical('vhfRadio');
          break;
        case 'toggle-instruments':
          handleToggleElectrical('instruments');
          break;
        case 'toggle-fridge':
          handleToggleElectrical('fridgeOn');
          break;
        case 'toggle-bilge':
          handleToggleElectrical('bilgePump');
          break;
        case 'trim-main-in':
          audioRef.current?.playWinchRatchet();
          commitSim({
            ...prev,
            mainsheetPct: prev.mainsheetPct >= 95 ? 35 : Math.min(100, prev.mainsheetPct + 12),
          });
          break;
        case 'trim-jib-in':
          audioRef.current?.playWinchRatchet();
          commitSim({
            ...prev,
            jibsheetPct: prev.jibsheetPct >= 95 ? 35 : Math.min(100, prev.jibsheetPct + 12),
          });
          break;
        case 'cycle-reef':
          handleCycleReef();
          break;
        case 'toggle-windvane':
          handleSetAutopilot(prev.autopilotMode === 'windvane' ? 'manual' : 'windvane');
          break;
        case 'toggle-anchor':
          handleToggleAnchor();
          break;
        case 'toggle-staysail':
          audioRef.current?.playWinchRatchet();
          commitSim({
            ...prev,
            staysailDeployed: !prev.staysailDeployed,
            lastLogEntry: !prev.staysailDeployed ? 'Cutter staysail hoisted.' : 'Cutter staysail furled.',
          });
          break;
        case 'steer-port-5':
          audioRef.current?.playSwitchClick();
          commitSim({
            ...prev,
            headingDeg: (prev.headingDeg - 5 + 360) % 360,
            autopilotTargetDeg:
              prev.autopilotMode === 'compass'
                ? (prev.headingDeg - 5 + 360) % 360
                : prev.autopilotMode === 'windvane'
                  ? normalizeAngle180(prev.autopilotTargetDeg + 5)
                  : prev.autopilotTargetDeg,
          });
          break;
        case 'steer-stbd-5':
          audioRef.current?.playSwitchClick();
          commitSim({
            ...prev,
            headingDeg: (prev.headingDeg + 5 + 360) % 360,
            autopilotTargetDeg:
              prev.autopilotMode === 'compass'
                ? (prev.headingDeg + 5 + 360) % 360
                : prev.autopilotMode === 'windvane'
                  ? normalizeAngle180(prev.autopilotTargetDeg - 5)
                  : prev.autopilotTargetDeg,
          });
          break;
        case 'open-chandlery':
          setChandleryOpen(true);
          break;
      }
    },
    [commitSim, handleCycleReef, handleSetAutopilot, handleToggleAnchor, handleToggleElectrical],
  );

  const handleInteract3DRef = useRef(handleInteract3D);
  handleInteract3DRef.current = handleInteract3D;

  // Mount Three.js WebGL Scene ONCE
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const audio = new SailingAudioEngine();
    audioRef.current = audio;

    const controller = new SailingSceneController(mount, {
      getState: () => simRef.current,
      getScreenState: () => screenRef.current,
      getCameraMode: () => cameraModeRef.current,
      onInteract3D: (action) => handleInteract3DRef.current(action),
      onHover3D: (label, x, y) => {
        setHoverTooltip((prev) => {
          if (!label && !prev) return null;
          if (!label) return null;
          return { label, x, y };
        });
      },
      onTickSimulation: (dt) => {
        const keys = keysPressedRef.current;
        let rudderInput: number = virtualSteerRef.current;
        if (keys.has('KeyA') || keys.has('ArrowLeft')) rudderInput -= 1;
        if (keys.has('KeyD') || keys.has('ArrowRight')) rudderInput += 1;
        rudderInput = clamp(rudderInput, -1, 1);

        let next = stepSimulationWithAccumulator(simRef.current, physAccumRef, dt, { rudderInput });

        // Continuous sheet trimming via Q / E
        if (keys.has('KeyQ')) {
          next = { ...next, mainsheetPct: clamp(next.mainsheetPct - 35 * dt, 5, 100) };
        }
        if (keys.has('KeyE')) {
          next = { ...next, mainsheetPct: clamp(next.mainsheetPct + 35 * dt, 5, 100) };
        }

        simRef.current = next;
        audio.updateAtmosphere(
          next.weather.trueWindSpeedKts,
          next.boatSpeedKts,
          next.weather.rainIntensity,
          screenRef.current !== 'playing',
        );

        const now = performance.now();
        if (now - lastHudSyncRef.current >= 100) {
          lastHudSyncRef.current = now;
          setSim(next);
        }
      },
    });

    return () => {
      controller.dispose();
      audio.dispose();
    };
  }, []);

  // Keyboard listener (WASD/Arrows, Q/E, R, V, H, Esc/P, Enter/Space on title)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (screenRef.current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStart();
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        e.preventDefault();
        if (worldChartOpen) {
          setWorldChartOpen(false);
          return;
        }
        if (chandleryOpen) {
          setChandleryOpen(false);
          return;
        }
        if (screenRef.current === 'playing') {
          setScreenState('paused');
        } else if (screenRef.current === 'paused') {
          setScreenState('playing');
        }
        return;
      }

      if (screenRef.current !== 'playing') return;

      if (!e.repeat) {
        if (e.code === 'KeyV') {
          setCameraMode((prev) =>
            prev === 'third-person'
              ? 'first-person-helm'
              : prev === 'first-person-helm'
                ? 'first-person-cabin'
                : 'third-person',
          );
        } else if (e.code === 'KeyH') {
          setDockCollapsed((prev) => !prev);
        } else if (e.code === 'KeyR') {
          handleCycleReef();
        }
      }

      keysPressedRef.current.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.code);
    };

    const releaseAllKeys = () => {
      keysPressedRef.current.clear();
      virtualSteerRef.current = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAllKeys);
    document.addEventListener('visibilitychange', releaseAllKeys);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAllKeys);
      document.removeEventListener('visibilitychange', releaseAllKeys);
    };
  }, [chandleryOpen, handleCycleReef, handleStart, worldChartOpen]);

  const handleLaunchPassage = useCallback(
    (from: WorldHub, to: WorldHub) => {
      const prev = simRef.current;
      const fresh = createInitialSimulationState(prev.boatId, from, to);
      const merged: SimulationState = {
        ...fresh,
        simRealism: prev.simRealism,
        inventory: prev.inventory,
        wear: prev.wear,
        passage: {
          ...fresh.passage,
          visitedHubIds: Array.from(new Set([...prev.passage.visitedHubIds, from.id])),
          monthOfYear: prev.passage.monthOfYear,
        },
      };
      physAccumRef.current = 0;
      commitSim(merged);
      setScreenState('playing');
    },
    [commitSim],
  );

  const handleCompletePassage = useCallback(() => {
    const { state } = settlePassageCompletion(simRef.current);
    commitSim(state);
    setScreenState('gameover');
  }, [commitSim]);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* Isolated WebGL Three.js Canvas Mount */}
      <div
        ref={canvasMountRef}
        data-testid="ocean-canvas"
        className="fixed inset-0 w-full h-full"
      />

      {screenState === 'title' && (
        <TitleScreen
          selectedBoat={sim.boatId}
          onSelectBoat={(boat: BoatId) => {
            const fresh = createInitialSimulationState(boat);
            commitSim({
              ...fresh,
              inventory: simRef.current.inventory,
            });
          }}
          onStart={handleStart}
          onOpenWorldChart={() => setWorldChartOpen(true)}
        />
      )}

      {screenState === 'playing' && (
        <SailingHUD
          sim={sim}
          cameraMode={cameraMode}
          muted={muted}
          dockCollapsed={dockCollapsed}
          touchPadEnabled={touchPadEnabled}
          hoverTooltip={hoverTooltip}
          onToggleDock={() => setDockCollapsed((v) => !v)}
          onToggleTouchPad={() => setTouchPadEnabled((v) => !v)}
          onSetCameraMode={(m) => setCameraMode(m)}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            audioRef.current?.setMuted(next);
          }}
          onPause={() => setScreenState('paused')}
          onOpenWorldChart={() => setWorldChartOpen(true)}
          onOpenChandlery={() => setChandleryOpen(true)}
          onHoldSteer={(dir) => {
            virtualSteerRef.current = dir;
          }}
          onSteerStep={(deltaDeg) => {
            const prev = simRef.current;
            const nextHeading = (prev.headingDeg + deltaDeg + 360) % 360;
            const nextTarget =
              prev.autopilotMode === 'compass'
                ? nextHeading
                : prev.autopilotMode === 'windvane'
                  ? normalizeAngle180(prev.autopilotTargetDeg - deltaDeg)
                  : prev.autopilotTargetDeg;
            commitSim({
              ...prev,
              headingDeg: nextHeading,
              autopilotTargetDeg: nextTarget,
              rudderAngleDeg: clamp(deltaDeg * 2, -32, 32),
            });
          }}
          onSetMainsheet={(pct) => {
            commitSim({ ...simRef.current, mainsheetPct: clamp(pct, 5, 100) });
          }}
          onSetJibsheet={(pct) => {
            commitSim({ ...simRef.current, jibsheetPct: pct });
          }}
          onToggleJib={() => {
            audioRef.current?.playWinchRatchet();
            const prev = simRef.current;
            commitSim({ ...prev, jibDeployed: !prev.jibDeployed });
          }}
          onToggleStaysail={() => {
            audioRef.current?.playWinchRatchet();
            const prev = simRef.current;
            commitSim({
              ...prev,
              staysailDeployed: !prev.staysailDeployed,
              lastLogEntry: !prev.staysailDeployed ? 'Cutter staysail hoisted.' : 'Cutter staysail furled.',
            });
          }}
          onSetReef={handleCycleReef}
          onSetSimRealism={(val) => {
            commitSim({ ...simRef.current, simRealism: val });
          }}
          onSetAutopilot={handleSetAutopilot}
          onSetTimeCompression={(spd) => {
            commitSim({ ...simRef.current, timeCompression: spd });
          }}
          onSleepWatch={(hours) => {
            const { state } = simulateWatchSleep(simRef.current, hours);
            commitSim(state);
          }}
          onTriggerSquallDemo={() => {
            const stepped = stepSimulation(simRef.current, 0.05, { forceSquall: true });
            commitSim({
              ...stepped,
              weather: {
                ...stepped.weather,
                phase: 'squall',
                barometerHpa: 999,
                barometerTrend: 'Falling Rapidly',
                cloudCover: 0.96,
                rainIntensity: 0.9,
                trueWindSpeedKts: 31,
                gustSpeedKts: 36,
                waveHeightM: 2.9,
                squallTriggered: true,
                forecastText:
                  'ACTIVE SQUALL: 36 kt gusts and steep beam chop! Reef mainsail to Reef 1 or Reef 2.',
              },
              alertMessage:
                'Squall front hit! Gusts 36 kts — reef mainsail now to reduce heel and sail wear.',
            });
          }}
          onToggleElectrical={handleToggleElectrical}
          onToggleAnchor={handleToggleAnchor}
          onSetRodeLength={(meters) => {
            const prev = simRef.current;
            commitSim({
              ...prev,
              anchor: { ...prev.anchor, rodeLengthM: meters },
            });
          }}
          onCompletePassage={handleCompletePassage}
        />
      )}

      <StatusModal
        screenState={screenState}
        sim={sim}
        onResume={() => setScreenState('playing')}
        onRestart={() => {
          physAccumRef.current = 0;
          const fresh = createInitialSimulationState(sim.boatId);
          commitSim({
            ...fresh,
            simRealism: sim.simRealism,
            inventory: sim.inventory,
          });
          setScreenState('playing');
        }}
        onReturnTitle={() => setScreenState('title')}
        onOpenWorldChart={() => setWorldChartOpen(true)}
        onResolveDistress={() => {
          audioRef.current?.playSwitchClick();
          physAccumRef.current = 0;
          commitSim(resolveDistressRecovery(simRef.current));
        }}
      />

      <WorldChartModal
        open={worldChartOpen}
        currentFromId={sim.passage.fromHubId}
        currentToId={sim.passage.toHubId}
        visitedHubIds={sim.passage.visitedHubIds}
        monthOfYear={sim.passage.monthOfYear}
        currentBoatId={sim.boatId}
        coins={sim.inventory.coins}
        onClose={() => setWorldChartOpen(false)}
        onSelectMonth={(month) => {
          const prev = simRef.current;
          commitSim({
            ...prev,
            passage: { ...prev.passage, monthOfYear: month },
          });
        }}
        onLaunchPassage={handleLaunchPassage}
        onSwitchBoat={(boat) => {
          commitSim(switchOrPurchaseBoat(simRef.current, boat));
        }}
      />

      <ChandleryModal
        open={chandleryOpen}
        sim={sim}
        onClose={() => setChandleryOpen(false)}
        onBuyItem={(itemId) => {
          audioRef.current?.playSwitchClick();
          commitSim(buyChandleryItem(simRef.current, itemId));
        }}
        onApplyRepair={(itemId) => {
          audioRef.current?.playWinchRatchet();
          commitSim(applySparePartRepair(simRef.current, itemId));
        }}
        onSwitchBoat={(boat) => {
          audioRef.current?.playSwitchClick();
          commitSim(switchOrPurchaseBoat(simRef.current, boat));
        }}
        onAcceptContract={(contract) => {
          audioRef.current?.playSwitchClick();
          commitSim(acceptCharterContract(simRef.current, contract));
        }}
        onUpdateVesselCfg={(patch) => {
          commitSim(updateVesselCfg(simRef.current, patch));
        }}
        onResetVesselCfg={() => {
          audioRef.current?.playSwitchClick();
          commitSim(resetVesselCfg(simRef.current));
        }}
      />
    </div>
  );
}
