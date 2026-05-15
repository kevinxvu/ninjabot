import { HashRouter, Routes, Route } from 'react-router-dom';
import { Home } from './pages/Home';
import { Chart } from './pages/Chart';
import './index.css';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/chart" element={<Chart />} />
      </Routes>
    </HashRouter>
  );
}

export default App;