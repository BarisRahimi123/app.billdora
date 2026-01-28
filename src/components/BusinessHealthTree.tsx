import { useState, useEffect } from 'react';
import { Settings, TrendingUp, Users, Target, DollarSign, Briefcase, Sliders, RotateCcw } from 'lucide-react';

interface BusinessHealthTreeProps {
  metrics: {
    cashFlow: number; // Actual % of invoices paid
    utilization: number; // Actual billable hours %
    winRate: number; // Actual win rate %
    momentum: number; // Actual proposals this month
    profitMargin: number; // Actual profit margin %
  };
  targets: {
    cashFlow: number;
    utilization: number;
    winRate: number;
    momentum: number;
    profitMargin: number;
  };
  onConfigureTargets?: () => void;
}

// Color interpolation helper
const interpolateColor = (color1: string, color2: string, factor: number): string => {
  const hex = (c: string) => parseInt(c, 16);
  const r1 = hex(color1.slice(1, 3)), g1 = hex(color1.slice(3, 5)), b1 = hex(color1.slice(5, 7));
  const r2 = hex(color2.slice(1, 3)), g2 = hex(color2.slice(3, 5)), b2 = hex(color2.slice(5, 7));
  const r = Math.round(r1 + (r2 - r1) * factor);
  const g = Math.round(g1 + (g2 - g1) * factor);
  const b = Math.round(b1 + (b2 - b1) * factor);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

const colorSchemes: Record<string, { healthy: string; unhealthy: string }> = {
  leaves: { healthy: '#22c55e', unhealthy: '#3d2314' },
  fruits: { healthy: '#FFE135', unhealthy: '#6b7280' },
  branches: { healthy: '#d4a574', unhealthy: '#2d1f14' },
  trunk: { healthy: '#8b6914', unhealthy: '#1a1a1a' },
  roots: { healthy: '#d4a017', unhealthy: '#3d3d3d' },
};

const getColorFilter = (partId: string, value: number): string => {
  const scheme = colorSchemes[partId];
  if (!scheme) return 'none';
  const factor = Math.min(value, 100) / 100;
  const targetColor = interpolateColor(scheme.unhealthy, scheme.healthy, factor);
  const hex = (c: string) => parseInt(c, 16);
  const r = hex(targetColor.slice(1, 3)) / 255;
  const g = hex(targetColor.slice(3, 5)) / 255;
  const b = hex(targetColor.slice(5, 7)) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const s = max === min ? 0 : l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
  let h = 0;
  if (max !== min) {
    if (max === r) h = ((g - b) / (max - min) + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / (max - min) + 2) * 60;
    else h = ((r - g) / (max - min) + 4) * 60;
  }
  const saturation = 0.3 + s * 1.5;
  const brightness = 0.5 + l * 0.8;
  return `sepia(1) saturate(${saturation}) brightness(${brightness}) hue-rotate(${h - 50}deg)`;
};

const getTrunkScale = (value: number): number => {
  if (value >= 50) return 1;
  return 0.92 + (value / 50) * 0.08;
};

const getLeavesOpacity = (value: number): { smaller: number; full: number } => {
  if (value < 15) return { smaller: 0.15, full: 0 };
  if (value <= 40) return { smaller: 1, full: 0 };
  const progress = (value - 40) / 60;
  return { smaller: 1 - progress, full: progress };
};

const getProfitOpacity = (value: number): { blossoms: number; fruits: number } => {
  // Blossoms: 10% opacity at 0, scales to 100% at 30%
  // Fruits: appear at 30%, full at 90%+
  if (value <= 30) {
    const blossomOpacity = 0.1 + (value / 30) * 0.9; // 10% to 100%
    return { blossoms: blossomOpacity, fruits: 0 };
  }
  if (value <= 90) {
    const fruitProgress = (value - 30) / 60; // 0 to 1 over 30%-90%
    return { blossoms: 1 - fruitProgress, fruits: fruitProgress };
  }
  return { blossoms: 0, fruits: 1 };
};

const getStatusInfo = (actual: number, target: number, isCount: boolean = false) => {
  const percentage = isCount ? (actual / target) * 100 : (actual / target) * 100;
  const healthPercent = Math.min(percentage, 100);
  
  if (healthPercent >= 80) return { label: 'Healthy', color: 'text-[#476E66]', bg: 'bg-[#476E66]/10' };
  if (healthPercent >= 50) return { label: 'Warning', color: 'text-amber-600', bg: 'bg-amber-50' };
  return { label: 'Critical', color: 'text-red-600', bg: 'bg-red-50' };
};

const METRIC_CONFIG = [
  { 
    id: 'roots', 
    key: 'cashFlow',
    name: 'Cash Flow', 
    icon: DollarSign,
    meaning: 'Financial foundation - % of invoices collected',
    unit: '%'
  },
  { 
    id: 'trunk', 
    key: 'utilization',
    name: 'Utilization', 
    icon: Users,
    meaning: 'Team efficiency - billable hours vs capacity',
    unit: '%'
  },
  { 
    id: 'branches', 
    key: 'winRate',
    name: 'Sales', 
    icon: Target,
    meaning: 'Sales success - proposals accepted',
    unit: '%'
  },
  { 
    id: 'leaves', 
    key: 'momentum',
    name: 'Marketing', 
    icon: TrendingUp,
    meaning: 'Growth activity - proposals sent this month',
    unit: '',
    isCount: true
  },
  { 
    id: 'fruits', 
    key: 'profitMargin',
    name: 'Profit', 
    icon: Briefcase,
    meaning: 'Business outcome - revenue minus expenses',
    unit: '%'
  },
];

const defaultMetrics = { cashFlow: 0, utilization: 0, winRate: 0, momentum: 0, profitMargin: 0 };

export default function BusinessHealthTree({ metrics, targets, onConfigureTargets }: BusinessHealthTreeProps) {
  const [svgs, setSvgs] = useState<Record<string, string>>({});
  const [simulatorMode, setSimulatorMode] = useState(false);
  const [simValues, setSimValues] = useState({ ...metrics });
  const [pulsePhase, setPulsePhase] = useState(0);
  
  // Sync simValues with metrics when not in simulator mode
  useEffect(() => {
    if (!simulatorMode) {
      setSimValues({ ...metrics });
    }
  }, [metrics, simulatorMode]);
  
  // Use simulator values or live data
  const activeMetrics = simulatorMode ? simValues : metrics;
  
  // Heartbeat pulse animation for critical parts
  useEffect(() => {
    const interval = setInterval(() => setPulsePhase(p => (p + 1) % 100), 50);
    return () => clearInterval(interval);
  }, []);
  
  // Heartbeat opacity calculation (smooth pulse)
  const getHeartbeatOpacity = (value: number): number => {
    if (value >= 15) return 1;
    // Create heartbeat effect: quick pulse up, slow fade down
    const beat = Math.sin(pulsePhase * 0.15) * 0.5 + 0.5;
    return 0.3 + beat * 0.7;
  };
  
  const getCriticalStyle = (value: number): React.CSSProperties => {
    if (value >= 15) return {};
    const opacity = getHeartbeatOpacity(value);
    return {
      opacity,
      filter: `drop-shadow(0 0 ${8 * (1 - opacity + 0.5)}px rgba(239, 68, 68, ${0.8 * (1 - opacity + 0.5)}))`
    };
  };

  useEffect(() => {
    const loadSvgs = async () => {
      const svgFiles = {
        roots: '/svgs/roots.svg',
        trunk: '/svgs/Trunk.svg',
        branches: '/svgs/branchs.svg',
        fullLeaves: '/svgs/spring-leaves.svg',
        smallerLeaves: '/svgs/leaves-smaller.svg',
        blossoms: '/svgs/blossoms.svg',
        fruits: '/svgs/fruits.svg',
      };
      const loaded: Record<string, string> = {};
      for (const [key, path] of Object.entries(svgFiles)) {
        try {
          const response = await fetch(path);
          const text = await response.text();
          loaded[key] = text;
        } catch (e) {
          console.error(`Failed to load ${key}:`, e);
        }
      }
      setSvgs(loaded);
    };
    loadSvgs();
  }, []);

  // Calculate health percentages (actual vs target)
  const getHealthPercent = (key: string): number => {
    const actual = activeMetrics[key as keyof typeof activeMetrics];
    const target = targets[key as keyof typeof targets];
    if (target === 0) return 0;
    return Math.min((actual / target) * 100, 100);
  };

  const rootsValue = getHealthPercent('cashFlow');
  const trunkValue = getHealthPercent('utilization');
  const branchesValue = getHealthPercent('winRate');
  const leavesValue = getHealthPercent('momentum');
  const profitValue = getHealthPercent('profitMargin');

  const leavesOpacity = getLeavesOpacity(leavesValue);
  const profitOpacity = getProfitOpacity(profitValue);
  const trunkScale = getTrunkScale(trunkValue);
  
  const overallHealth = Math.round((rootsValue + trunkValue + branchesValue + leavesValue + profitValue) / 5);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 sm:gap-3">
      {/* Tree Visualization */}
      <div className="lg:col-span-7 bg-white rounded-xl p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-neutral-900">Business Health</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">Overall:</span>
            <span className={`text-lg font-bold ${
              overallHealth >= 70 ? 'text-[#476E66]' : 
              overallHealth >= 40 ? 'text-amber-600' : 'text-red-600'
            }`}>
              {overallHealth}%
            </span>
          </div>
        </div>
        
        {/* Simulator Toggle */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            onClick={() => setSimulatorMode(!simulatorMode)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg transition-all ${
              simulatorMode 
                ? 'bg-[#476E66]/10 text-[#476E66] ring-1 ring-[#476E66]/20' 
                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            {simulatorMode ? 'Simulator Active' : 'Try Simulator'}
          </button>
          {simulatorMode && (
            <button
              onClick={() => {
                setSimValues({ ...metrics });
                setSimulatorMode(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-all"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Back to Live Data
            </button>
          )}
        </div>
        
        {simulatorMode && (
          <div className="text-xs px-3 py-2 rounded-lg mb-3 bg-[#476E66]/5 text-[#476E66]">
            🎮 Drag the sliders below to see how each metric affects your business tree
          </div>
        )}

        <div className="relative w-full aspect-square max-w-md mx-auto rounded-xl overflow-hidden transition-all duration-300 bg-gradient-to-b from-sky-50/50 to-amber-50/30">
          {/* Inner container with padding to prevent clipping */}
          <div className="absolute inset-4">
          {/* Roots Layer */}
          {svgs.roots && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ 
                filter: getColorFilter('roots', rootsValue),
                ...getCriticalStyle(rootsValue)
              }}
              dangerouslySetInnerHTML={{ __html: svgs.roots }}
            />
          )}

          {/* Trunk Layer */}
          {svgs.trunk && (
            <div
              className="absolute inset-0 w-full h-full origin-bottom"
              style={{ 
                filter: getColorFilter('trunk', trunkValue),
                transform: `scaleY(${trunkScale})`,
                ...getCriticalStyle(trunkValue)
              }}
              dangerouslySetInnerHTML={{ __html: svgs.trunk }}
            />
          )}

          {/* Branches Layer */}
          {svgs.branches && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ 
                filter: getColorFilter('branches', branchesValue),
                ...getCriticalStyle(branchesValue)
              }}
              dangerouslySetInnerHTML={{ __html: svgs.branches }}
            />
          )}

          {/* Leaves Layers */}
          {svgs.smallerLeaves && leavesOpacity.smaller > 0 && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ 
                filter: leavesValue < 15 ? getCriticalStyle(leavesValue).filter : getColorFilter('leaves', leavesValue),
                opacity: leavesValue < 15 ? getHeartbeatOpacity(leavesValue) * leavesOpacity.smaller : leavesOpacity.smaller
              }}
              dangerouslySetInnerHTML={{ __html: svgs.smallerLeaves }}
            />
          )}
          {svgs.fullLeaves && leavesOpacity.full > 0 && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ 
                filter: leavesValue < 15 ? getCriticalStyle(leavesValue).filter : getColorFilter('leaves', leavesValue),
                opacity: leavesValue < 15 ? getHeartbeatOpacity(leavesValue) * leavesOpacity.full : leavesOpacity.full
              }}
              dangerouslySetInnerHTML={{ __html: svgs.fullLeaves }}
            />
          )}

          {/* Profit Layers */}
          {svgs.blossoms && profitOpacity.blossoms > 0 && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ 
                opacity: profitValue < 15 ? getHeartbeatOpacity(profitValue) * profitOpacity.blossoms : profitOpacity.blossoms,
                filter: profitValue < 15 ? getCriticalStyle(profitValue).filter : undefined
              }}
              dangerouslySetInnerHTML={{ __html: svgs.blossoms }}
            />
          )}
          {svgs.fruits && profitOpacity.fruits > 0 && (
            <div
              className="absolute inset-0 w-full h-full"
              style={{ 
                filter: profitValue < 15 ? getCriticalStyle(profitValue).filter : getColorFilter('fruits', profitValue),
                opacity: profitValue < 15 ? getHeartbeatOpacity(profitValue) * profitOpacity.fruits : profitOpacity.fruits
              }}
              dangerouslySetInnerHTML={{ __html: svgs.fruits }}
            />
          )}
          </div>{/* End inner container */}
        </div>
        
        </div>

      {/* Metrics Panel */}
      <div className="lg:col-span-5 space-y-2 sm:space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-semibold text-neutral-900">Metrics</h2>
          <div className="flex items-center gap-2">
            {simulatorMode && (
              <button
                onClick={() => {
                  setSimValues({ ...metrics });
                  setSimulatorMode(false);
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-neutral-100 text-neutral-600 hover:bg-neutral-200 transition-all"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>
            )}
            {onConfigureTargets && (
              <button
                onClick={onConfigureTargets}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 rounded-lg transition-colors font-medium"
              >
                <Settings className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Configure Targets</span>
                <span className="sm:hidden">Targets</span>
              </button>
            )}
          </div>
        </div>
        
        {simulatorMode && (
          <div className="text-xs px-3 py-2 rounded-lg bg-[#476E66]/5 text-[#476E66]">
            🎮 Drag the sliders to see how metrics affect your tree
          </div>
        )}

        <div className="space-y-2">
          {METRIC_CONFIG.map((config) => {
            const actual = activeMetrics[config.key as keyof typeof activeMetrics];
            const target = targets[config.key as keyof typeof targets];
            const status = getStatusInfo(actual, target, config.isCount);
            const Icon = config.icon;
            const sliderMax = config.isCount ? 30 : 100;

            // Calculate title critical animation style
            const isCritical = actual < 15;
            const beat = Math.sin(pulsePhase * 0.15) * 0.5 + 0.5;
            const titleCriticalStyle: React.CSSProperties = isCritical ? {
              backgroundColor: `rgba(239, 68, 68, ${0.15 + beat * 0.25})`,
              boxShadow: `0 0 ${8 * beat}px rgba(239, 68, 68, ${0.2 * beat})`
            } : {};

            return (
              <div 
                key={config.id} 
                className="bg-white rounded-lg p-3 transition-all"
                style={{ boxShadow: 'var(--shadow-card)' }}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#476E66]/10 flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-[#476E66]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 
                        className={`text-sm font-medium text-neutral-900 px-1.5 py-0.5 -ml-1.5 rounded-lg transition-all ${isCritical ? 'text-red-700' : ''}`}
                        style={titleCriticalStyle}
                      >{config.name}</h3>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color} font-medium`}>
                        {status.label}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 mb-2">{config.meaning}</p>
                    <div className="flex items-baseline gap-1.5 mb-2">
                      <span className="text-lg font-bold text-neutral-900">
                        {config.isCount ? actual : `${actual.toFixed(1)}%`}
                      </span>
                      <span className="text-xs text-neutral-400">
                        / {config.isCount ? target : `${target}%`}
                      </span>
                    </div>
                    {/* Interactive Slider */}
                    <div className="mt-2">
                      <input
                        type="range"
                        min="0"
                        max={sliderMax}
                        value={simValues[config.key as keyof typeof simValues]}
                        onChange={(e) => {
                          if (!simulatorMode) setSimulatorMode(true);
                          setSimValues(prev => ({ ...prev, [config.key]: Number(e.target.value) }));
                        }}
                        className="w-full h-1.5 bg-neutral-100 rounded-lg appearance-none cursor-pointer accent-[#476E66]"
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
