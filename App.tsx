import React from 'react';
import { WormsGame } from './components/WormsGame';

const App: React.FC = () => {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <WormsGame />
    </div>
  );
};

export default App;