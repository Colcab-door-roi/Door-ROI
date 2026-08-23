import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StoreCapture from './pages/StoreCapture'
import Admin from './pages/Admin'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StoreCapture />} />
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
