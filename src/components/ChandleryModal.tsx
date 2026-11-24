import { useMemo, useState } from 'react';
import { X, Wrench, ShoppingBag, Ship, FileText, Sliders, RotateCcw } from 'lucide-react';
import { BOAT_SPECS, CHANDLERY_ITEMS, generatePortContracts } from '../sim/boats';
import type {
  BoatId,
  CharterContract,
  SimulationState,
  SystemKey,
  VesselCfgParams,
} from '../types/sailing';

interface ChandleryModalProps {
  open: boolean;
  sim: SimulationState;
  onClose: () => void;
  onBuyItem: (itemId: string) => void;
  onApplyRepair: (itemId: string) => void;
  onSwitchBoat: (boat: BoatId) => void;
  onAcceptContract: (contract: CharterContract) => void;
  onUpdateVesselCfg: (patch: Partial<VesselCfgParams>) => void;
  onResetVesselCfg: () => void;
}

const SYSTEM_LABELS: Array<{ key: SystemKey; label: string; partId: string }> = [
  { key: 'mainsail', label: 'Mainsail & Battens', partId: 'sail-repair-kit' },
  { key: 'rigging', label: 'Standing Rigging & Blocks', partId: 'shackle-rigging-pack' },
  { key: 'hull', label: 'Hull & Antifouling', partId: 'antifouling-epoxy' },
  { key: 'rudder', label: 'Rudder & Steering', partId: 'rudder-pintle-kit' },
  { key: 'battery', label: '12V House Battery Bank', partId: 'agm-cell-kit' },
  { key: 'fridge', label: 'Galley Fridge Compressor', partId: 'compressor-seal' },
];

type ChandleryTab = 'chandlery' | 'charters' | 'boatcfg';

export function ChandleryModal({
  open,
  sim,
  onClose,
  onBuyItem,
  onApplyRepair,
  onSwitchBoat,
  onAcceptContract,
  onUpdateVesselCfg,
  onResetVesselCfg,
}: ChandleryModalProps) {
  const [rightTab, setRightTab] = useState<ChandleryTab>('chandlery');

  const contracts = useMemo(
    () => generatePortContracts(sim.passage.fromHubId, sim.passage.toHubId, sim.boatId),
    [sim.passage.fromHubId, sim.passage.toHubId, sim.boatId],
  );

  if (!open) return null;

  const canUseDockyard =
    sim.anchor.deployed ||
    sim.passage.xNm < 4.5 ||
    sim.passage.arrivedAtCove;

  const cfg = sim.vesselCfg ?? BOAT_SPECS[sim.boatId].defaultCfg;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dockside Chandlery & Boatyard"
    >
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-50">
                Dockside Chandlery, Charters &amp; Boatyard
              </h2>
              <p className="text-xs text-slate-400">
                {canUseDockyard
                  ? `Harbor services available (${sim.passage.xNm < 10 ? sim.passage.fromName : sim.passage.toName}) · Upkeep ${cfg.dailyUpkeepCr} Cr/day`
                  : `At sea — apply spare parts or tune boat.cfg; anchor to buy stores · Upkeep ${cfg.dailyUpkeepCr} Cr/day`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Purse (Paid Upkeep: {sim.inventory.totalRunningCostsCr ?? 0} Cr)</div>
              <div className="font-mono-tabular text-sm font-semibold text-amber-400">
                {sim.inventory.coins} Cr
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Chandlery"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          {/* Left: Vessel Condition & Spare Part Repairs */}
          <div>
            <h3 className="text-sm font-semibold text-slate-200 mb-3">
              Vessel Condition &amp; Locker Repairs
            </h3>
            <div className="space-y-2.5">
              {SYSTEM_LABELS.map(({ key, label, partId }) => {
                const cond = Math.round(sim.wear[key]);
                const owned = sim.inventory.parts[partId] ?? 0;
                const barColor =
                  cond > 75 ? 'bg-emerald-500' : cond > 45 ? 'bg-amber-500' : 'bg-red-500';

                return (
                  <div
                    key={key}
                    className="bg-slate-950/70 border border-slate-800 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-slate-200">{label}</span>
                      <span className="font-mono-tabular text-slate-300">{cond}%</span>
                    </div>
                    <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                      <div className={`h-full ${barColor}`} style={{ width: `${cond}%` }} />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">
                        Spare Kits in Locker: <strong className="text-slate-200">{owned}</strong>
                      </span>
                      <button
                        type="button"
                        disabled={owned <= 0 || cond >= 100}
                        onClick={() => onApplyRepair(partId)}
                        className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                          owned > 0 && cond < 100
                            ? 'bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        Repair {label.split(' ')[0]}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Chandlery Store / Charter Contracts / Virtual Sailor NG boat.cfg */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-1.5 bg-slate-950/70 p-1 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'chandlery', label: 'Chandlery & Boatyard', icon: ShoppingBag },
                  { id: 'charters', label: 'Charter Contracts', icon: FileText },
                  { id: 'boatcfg', label: 'boat.cfg Surfaces', icon: Sliders },
                ] as Array<{ id: ChandleryTab; label: string; icon: typeof ShoppingBag }>
              ).map((tab) => {
                const Icon = tab.icon;
                const active = rightTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setRightTab(tab.id)}
                    className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950 font-semibold'
                        : 'text-slate-300 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {rightTab === 'chandlery' && (
              <>
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {CHANDLERY_ITEMS.map((item) => {
                    const canBuy = canUseDockyard && sim.inventory.coins >= item.price;
                    const owned = sim.inventory.parts[item.id] ?? 0;
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-lg p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-slate-400 leading-snug">
                            {item.description}
                          </div>
                          {!item.provisionsDaysAdd && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              In locker: {owned}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          disabled={!canBuy}
                          onClick={() => onBuyItem(item.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                            canBuy
                              ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          Buy · {item.price} Cr
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Shipyard Boat Commissioning */}
                <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200 mb-2">
                    <Ship className="w-4 h-4 text-amber-400" aria-hidden="true" />
                    <span>Boatyard Brokerage</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {(['elan-19', 'rustler-36'] as BoatId[]).map((id) => {
                      const b = BOAT_SPECS[id];
                      const active = sim.boatId === id;
                      const affordable = sim.inventory.coins >= b.priceCoins;
                      return (
                        <button
                          key={id}
                          type="button"
                          disabled={active || (!affordable && b.priceCoins > 0)}
                          onClick={() => onSwitchBoat(id)}
                          className={`text-left p-2.5 rounded-lg border text-xs ${
                            active
                              ? 'bg-amber-500/15 border-amber-400 text-slate-100'
                              : affordable || b.priceCoins === 0
                                ? 'bg-slate-900 border-slate-700 hover:border-slate-500 text-slate-200 cursor-pointer'
                                : 'bg-slate-900/50 border-slate-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          <div className="font-semibold">{b.name}</div>
                          <div className="text-[11px] text-slate-400">
                            {active ? 'Current Vessel' : b.priceCoins === 0 ? 'Commission Free' : `Upgrade · ${b.priceCoins} Cr`}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {rightTab === 'charters' && (
              <div className="space-y-3">
                <div className="text-xs text-slate-300">
                  Accept port cargo or charter dispatches (inspired by Ship Happens). Timely delivery without grounding pays full bonus at destination.
                </div>

                {sim.inventory.activeContract && (
                  <div className="bg-emerald-950/40 border border-emerald-500/50 rounded-lg p-3 text-xs">
                    <div className="font-semibold text-emerald-300">
                      Active Charter: {sim.inventory.activeContract.title}
                    </div>
                    <div className="text-slate-300 mt-0.5">
                      Deliver to {sim.inventory.activeContract.toName} within{' '}
                      {sim.inventory.activeContract.deadlineHours}h for +{sim.inventory.activeContract.rewardCr} Cr.
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {contracts.map((c) => {
                    const isActive = sim.inventory.activeContract?.id === c.id;
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 bg-slate-950/70 border border-slate-800 rounded-lg p-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-100 truncate">
                            {c.title}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {c.cargoType} · {c.distanceNm} NM · Deadline {c.deadlineHours}h
                            {c.fragile ? ' · Fragile (No Grounding)' : ''}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={isActive}
                          onClick={() => onAcceptContract(c)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                            isActive
                              ? 'bg-emerald-900/50 text-emerald-300 cursor-default'
                              : 'bg-amber-500 hover:bg-amber-400 text-slate-950 cursor-pointer'
                          }`}
                        >
                          {isActive ? 'Signed' : `Accept · +${c.rewardCr} Cr`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {rightTab === 'boatcfg' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-slate-300">
                    Moddable <code className="text-amber-300">boat.cfg</code> &amp; <code className="text-amber-300">[wing_sur]</code> foil tuning
                  </div>
                  <button
                    type="button"
                    onClick={onResetVesselCfg}
                    className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    Reset Spec
                  </button>
                </div>

                <div className="space-y-2.5 bg-slate-950/70 border border-slate-800 rounded-lg p-3.5">
                  {(
                    [
                      { key: 'sailAreaM2', label: 'mainsail_area (m²)', min: 8, max: 52, step: 0.5 },
                      { key: 'jibAreaM2', label: 'jib_area (m²)', min: 4, max: 38, step: 0.5 },
                      { key: 'keelAreaM2', label: 'keel_area (m²)', min: 0.4, max: 5.5, step: 0.1 },
                      { key: 'rudderAreaM2', label: 'rudder_area (m²)', min: 0.2, max: 1.5, step: 0.05 },
                      { key: 'wingSurDragM2', label: 'wing_sur hull drag (m²)', min: 1.2, max: 8.5, step: 0.1 },
                      { key: 'stabilityBody', label: 'stability_body', min: 0.4, max: 2.5, step: 0.05 },
                      { key: 'pitchDampening', label: 'pitch_dampening', min: 0.5, max: 2.0, step: 0.05 },
                    ] as Array<{ key: keyof VesselCfgParams; label: string; min: number; max: number; step: number }>
                  ).map((param) => (
                    <div key={param.key}>
                      <div className="flex justify-between text-[11px] mb-0.5">
                        <label htmlFor={`cfg-${param.key}`} className="font-mono-tabular text-slate-300">
                          {param.label}
                        </label>
                        <span className="font-mono-tabular text-amber-400">
                          {Number(cfg[param.key]).toFixed(2)}
                        </span>
                      </div>
                      <input
                        id={`cfg-${param.key}`}
                        type="range"
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        value={cfg[param.key]}
                        onChange={(e) => onUpdateVesselCfg({ [param.key]: Number(e.target.value) })}
                        className="w-full maritime-slider"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
