import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StoreCapture from './pages/StoreCapture'

// Reps never load Admin's code — only whoever actually opens /admin does.
const Admin = lazy(() => import('./pages/Admin'))

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StoreCapture />} />
        <Route
          path="/admin"
          element={
            <Suspense fallback={<div className="p-4 text-sm text-slate-500">Loading…</div>}>
              <Admin />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}

export default App
