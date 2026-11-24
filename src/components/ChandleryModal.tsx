import { X, Wrench, ShoppingBag, Ship } from 'lucide-react';
import { BOAT_SPECS, CHANDLERY_ITEMS } from '../sim/boats';
import type { BoatId, SimulationState, SystemKey } from '../types/sailing';

interface ChandleryModalProps {
  open: boolean;
  sim: SimulationState;
  onClose: () => void;
  onBuyItem: (itemId: string) => void;
  onApplyRepair: (itemId: string) => void;
  onSwitchBoat: (boat: BoatId) => void;
}

const SYSTEM_LABELS: Array<{ key: SystemKey; label: string; partId: string }> = [
  { key: 'mainsail', label: 'Mainsail & Battens', partId: 'sail-repair-kit' },
  { key: 'rigging', label: 'Standing Rigging & Blocks', partId: 'shackle-rigging-pack' },
  { key: 'hull', label: 'Hull & Antifouling', partId: 'antifouling-epoxy' },
  { key: 'rudder', label: 'Rudder & Steering', partId: 'rudder-pintle-kit' },
  { key: 'battery', label: '12V House Battery Bank', partId: 'agm-cell-kit' },
  { key: 'fridge', label: 'Galley Fridge Compressor', partId: 'compressor-seal' },
];

export function ChandleryModal({
  open,
  sim,
  onClose,
  onBuyItem,
  onApplyRepair,
  onSwitchBoat,
}: ChandleryModalProps) {
  if (!open) return null;

  const canUseDockyard =
    sim.anchor.deployed ||
    sim.passage.xNm < 4.5 ||
    sim.passage.arrivedAtCove;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Dockside Chandlery & Boatyard"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Wrench className="w-5 h-5 text-amber-400" aria-hidden="true" />
            <div>
              <h2 className="font-display text-xl font-semibold text-slate-50">
                Dockside Chandlery & Boatyard
              </h2>
              <p className="text-xs text-slate-400">
                {canUseDockyard
                  ? `Harbor services available (${sim.passage.xNm < 10 ? sim.passage.fromName : sim.passage.toName})`
                  : 'At sea — you can still apply spare parts from your locker, or anchor in cove to buy supplies.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-[11px] text-slate-400">Ship&apos;s Purse</div>
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
              Vessel Condition & Locker Repairs
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

          {/* Right: Chandlery Store & Boatyard Upgrade */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <ShoppingBag className="w-4 h-4 text-amber-400" aria-hidden="true" />
                <h3 className="text-sm font-semibold text-slate-200">
                  Chandlery Parts & Provisions
                </h3>
              </div>
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
          </div>
        </div>
      </div>
    </div>
  );
}
