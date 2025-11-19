import React from 'react';
import { Worm, GameState } from '../types';
import { MAX_POWER, COLORS } from '../constants';

interface UIOverlayProps {
  currentTurnIndex: number;
  worms: Worm[];
  wind: number;
  power: number;
  gameState: GameState;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({ currentTurnIndex, worms, wind, power, gameState }) => {
  const currentWorm = worms[currentTurnIndex];
  const isGameOver = gameState === GameState.GAME_OVER;
  
  // Calculate total team HP
  const team1Hp = worms.filter(w => w.teamId === 1 && !w.isDead).reduce((acc, w) => acc + w.hp, 0);
  const team2Hp = worms.filter(w => w.teamId === 2 && !w.isDead).reduce((acc, w) => acc + w.hp, 0);

  return (
    <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-10 flex flex-col justify-between p-4">
      
      {/* Top Bar: Team Status */}
      <div className="flex justify-between items-start w-full">
        {/* Team 1 */}
        <div className="flex flex-col gap-1 bg-gray-900/70 p-3 rounded-lg border-l-4 border-red-500 text-white">
            <h2 className="font-bold text-red-400 uppercase tracking-wider">Team Red</h2>
            <div className="text-2xl font-mono font-bold">{team1Hp} <span className="text-sm font-normal text-gray-400">HP</span></div>
            <div className="text-xs text-gray-300">Alive: {worms.filter(w => w.teamId === 1 && !w.isDead).length}</div>
        </div>

        {/* Wind Indicator */}
        <div className="flex flex-col items-center bg-gray-900/50 p-2 rounded-full w-32">
            <span className="text-xs text-gray-400 uppercase mb-1">Wind</span>
            <div className="w-full h-2 bg-gray-700 rounded-full relative overflow-hidden">
                <div 
                    className={`absolute top-0 h-full ${wind > 0 ? 'right-1/2 bg-blue-400' : 'left-1/2 bg-blue-400 origin-right'} transition-all duration-500`}
                    style={{ 
                        width: `${Math.abs(wind) * 200}%`,
                        left: wind < 0 ? 'auto' : '50%',
                        right: wind < 0 ? '50%' : 'auto',
                        transform: wind < 0 ? 'scaleX(-1)' : 'none' // visual trick
                    }}
                />
            </div>
            <div className="text-[10px] text-gray-500 mt-1 font-mono">{wind.toFixed(2)}</div>
        </div>

        {/* Team 2 */}
        <div className="flex flex-col gap-1 bg-gray-900/70 p-3 rounded-lg border-r-4 border-blue-500 text-right text-white">
            <h2 className="font-bold text-blue-400 uppercase tracking-wider">Team Blue</h2>
            <div className="text-2xl font-mono font-bold">{team2Hp} <span className="text-sm font-normal text-gray-400">HP</span></div>
             <div className="text-xs text-gray-300">Alive: {worms.filter(w => w.teamId === 2 && !w.isDead).length}</div>
        </div>
      </div>

      {/* Center: Turn Info or Game Over */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 text-center">
        {isGameOver ? (
             <div className="bg-black/80 text-white p-6 rounded-xl border-2 border-yellow-500 animate-bounce">
                <h1 className="text-4xl font-black text-yellow-400 mb-2">GAME OVER</h1>
                <p className="text-xl">
                    {team1Hp > team2Hp ? "TEAM RED WINS!" : team2Hp > team1Hp ? "TEAM BLUE WINS!" : "DRAW!"}
                </p>
                 <button onClick={() => window.location.reload()} className="mt-4 pointer-events-auto px-4 py-2 bg-white text-black font-bold rounded hover:bg-gray-200 transition">
                     Replay
                 </button>
             </div>
        ) : (
            <div className={`px-6 py-2 rounded-full backdrop-blur-sm border border-white/10 text-white shadow-lg transition-all duration-300 ${
                currentWorm?.teamId === 1 ? 'bg-red-600/40' : 'bg-blue-600/40'
            }`}>
                <span className="text-sm opacity-75 mr-2">Current Turn:</span>
                <span className="font-bold text-lg tracking-wide">{currentWorm?.name}</span>
            </div>
        )}
      </div>

      {/* Bottom Bar: Controls & Power */}
      <div className="flex flex-col items-center w-full mb-6 gap-4">
          
          {/* Power Meter */}
          {gameState !== GameState.GAME_OVER && (
              <div className="w-1/2 max-w-md">
                  <div className="flex justify-between text-xs text-white font-bold mb-1 px-1 uppercase shadow-black drop-shadow-md">
                      <span>Power</span>
                      <span>{Math.round((power / MAX_POWER) * 100)}%</span>
                  </div>
                  <div className="w-full h-6 bg-gray-800 border-2 border-gray-600 rounded-md overflow-hidden relative">
                       {/* Striped background effect */}
                       <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(45deg, #000 25%, transparent 25%, transparent 50%, #000 50%, #000 75%, transparent 75%, transparent)', backgroundSize: '10px 10px' }}></div>
                       
                       <div 
                           className="h-full transition-all duration-75 ease-linear"
                           style={{ 
                               width: `${(power / MAX_POWER) * 100}%`,
                               backgroundColor: power > MAX_POWER * 0.8 ? '#ef4444' : power > MAX_POWER * 0.5 ? '#eab308' : '#22c55e'
                           }}
                       />
                  </div>
              </div>
          )}

          {/* Controls Helper */}
          <div className="flex gap-6 text-xs text-white/70 bg-black/40 px-6 py-2 rounded-full backdrop-blur-md">
              <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="border border-white/30 rounded px-1">←</span>
                    <span className="border border-white/30 rounded px-1">→</span>
                  </div>
                  <span>Move</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="border border-white/30 rounded px-1">↑</span>
                    <span className="border border-white/30 rounded px-1">↓</span>
                  </div>
                  <span>Aim</span>
              </div>
              <div className="flex items-center gap-2">
                  <span className="border border-white/30 rounded px-2 py-0.5">Space</span>
                  <span>Fire (Hold)</span>
              </div>
          </div>
      </div>
      
      {/* Floating Labels for Worms (Projected ideally, but static simple list here or hardcoded overlay could be done, but ThreeJS labels are better. We will trust visual identification for now) */}
    </div>
  );
};