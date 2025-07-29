
import React from 'react';
import LoaderWidget from './components/LoaderWidget';

const App: React.FC = () => {
  return (
    <main className="bg-slate-950 min-h-screen flex items-center justify-center p-4 font-sans text-white antialiased">
      <LoaderWidget />
    </main>
  );
};

export default App;
